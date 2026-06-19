import { HttpStatus } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { createMockArgumentsHost } from '../../../test/helpers/test-setup.utils';
import { TypeOrmExceptionFilter } from './typeorm-exceptions.filter';

function createPgQueryError(code: string, message = 'database constraint failed'): QueryFailedError {
  const error = new QueryFailedError('INSERT INTO example', [], new Error(message));
  (error as QueryFailedError & { code?: string }).code = code;
  return error;
}

describe('TypeOrmExceptionFilter', () => {
  let filter: TypeOrmExceptionFilter;
  let mockHost: ReturnType<typeof createMockArgumentsHost>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmExceptionFilter,
        {
          provide: I18nService,
          useValue: {
            translate: jest.fn().mockImplementation((key: string) => {
              const translations: Record<string, string> = {
                'common.internal_error': 'An unexpected error occurred. Please try again later.',
                'common.resource_exists': 'Resource already exists.',
                'common.invalid_reference': 'Related resource not found or invalid reference.',
                'common.missing_field': 'Missing required field.',
              };
              return translations[key] ?? key;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<TypeOrmExceptionFilter>(TypeOrmExceptionFilter);
    mockHost = createMockArgumentsHost({
      url: '/api/v1/bookings',
      method: 'POST',
      headers: { 'x-correlation-id': 'corr-123', 'accept-language': 'ar,en;q=0.9' },
    });
  });

  it.each([
    ['23505', HttpStatus.CONFLICT, 'database.conflict', 'Resource already exists.'],
    [
      '23503',
      HttpStatus.BAD_REQUEST,
      'database.foreign_key_violation',
      'Related resource not found or invalid reference.',
    ],
    ['23502', HttpStatus.BAD_REQUEST, 'database.not_null_violation', 'Missing required field.'],
  ])('maps postgres code %s to HTTP %i', (dbCode, status, code, message) => {
    filter.catch(createPgQueryError(dbCode), mockHost);

    expect(mockHost.mockResponse.status).toHaveBeenCalledWith(status);
    expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: status,
        message,
        code,
        path: '/api/v1/bookings',
        correlationId: 'corr-123',
        timestamp: expect.any(String),
      }),
    );
  });

  it('returns 500 with fallback message for unknown database codes', () => {
    filter.catch(createPgQueryError('99999'), mockHost);

    expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'database.error',
        message: 'An unexpected error occurred. Please try again later.',
      }),
    );
  });
});
