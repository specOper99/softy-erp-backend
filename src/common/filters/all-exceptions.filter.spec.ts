import { HttpException, HttpStatus } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { createMockArgumentsHost } from '../../../test/helpers/test-setup.utils';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHost: ReturnType<typeof createMockArgumentsHost>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: I18nService,
          useValue: {
            translate: jest.fn().mockImplementation((key: string) => {
              if (key === 'common.internal_error') {
                return 'An unexpected error occurred. Please try again later.';
              }
              if (key === 'common.message_unavailable') {
                return 'Sorry, that message could not be loaded.';
              }
              if (key === 'booking.not_found') {
                return 'Booking missing (translated)';
              }
              if (key === 'validation.required') {
                return 'Field required (translated)';
              }
              return key;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    mockHost = createMockArgumentsHost();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should handle HttpException with object response', () => {
      const exception = new HttpException({ message: 'Bad Request', error: 'ValidationError' }, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad Request',
          // error field is not in ErrorResponse interface
          path: '/api/v1/test',
        }),
      );
    });

    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
        }),
      );
    });

    it('should handle HttpException with array message (flattened)', () => {
      const exception = new HttpException(
        { message: ['Field is required', 'Field must be valid'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Field is required, Field must be valid',
        }),
      );
    });

    it('should handle generic Error with sanitized message', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
        }),
      );
    });

    it('should handle unknown exception type', () => {
      const exception = 'Unknown error string';

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
        }),
      );
    });

    it('should include timestamp in response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });

    it('should translate structured API error { code, args } and echo code in JSON', () => {
      const exception = new HttpException({ code: 'booking.not_found', args: { id: 'b1' } }, HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Booking missing (translated)',
          code: 'booking.not_found',
        }),
      );
    });

    it('should translate validation batch with errors array', () => {
      const exception = new HttpException(
        {
          code: 'validation.failed',
          validationErrors: [{ property: 'email', code: 'validation.required' }],
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'validation.failed',
          message: 'Field required (translated)',
          errors: [
            expect.objectContaining({
              field: 'email',
              code: 'validation.required',
              message: 'Field required (translated)',
            }),
          ],
        }),
      );
    });
  });
});
