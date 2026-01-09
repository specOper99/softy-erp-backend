import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';
import { StructuredLoggingInterceptor } from './structured-logging.interceptor';

describe('StructuredLoggingInterceptor', () => {
  let interceptor: StructuredLoggingInterceptor;

  const mockRequest = {
    method: 'GET',
    url: '/api/v1/test',
    headers: {
      'x-correlation-id': 'test-correlation-id',
      'user-agent': 'Jest Test Agent',
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    user: { sub: 'user-123' },
  };

  const mockResponse = {
    statusCode: 200,
  };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StructuredLoggingInterceptor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('false'),
          },
        },
      ],
    }).compile();

    interceptor = module.get<StructuredLoggingInterceptor>(
      StructuredLoggingInterceptor,
    );

    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should log successful request', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => done(),
      });
    });

    it('should log error request', (done) => {
      const error = new Error('Test error');
      const mockCallHandler: CallHandler = {
        handle: () => throwError(() => error),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => done(),
      });
    });

    it('should handle array correlation id header', (done) => {
      const requestWithArrayHeader = {
        ...mockRequest,
        headers: {
          ...mockRequest.headers,
          'x-correlation-id': ['id1', 'id2'],
        },
      };

      const contextWithArray = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithArrayHeader,
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(contextWithArray, mockCallHandler).subscribe({
        complete: () => done(),
      });
    });

    it('should handle missing user', (done) => {
      const requestWithoutUser = {
        ...mockRequest,
        user: undefined,
      };

      const contextWithoutUser = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithoutUser,
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(contextWithoutUser, mockCallHandler).subscribe({
        complete: () => done(),
      });
    });

    it('should handle x-forwarded-for header', (done) => {
      const requestWithForwardedFor = {
        ...mockRequest,
        headers: {
          ...mockRequest.headers,
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      };

      const contextWithForwarded = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithForwardedFor,
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(contextWithForwarded, mockCallHandler).subscribe({
        complete: () => done(),
      });
    });

    it('should handle non-Error exceptions', (done) => {
      const mockCallHandler: CallHandler = {
        handle: () => throwError(() => 'String error'),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => done(),
      });
    });

    it('should handle error with status property', (done) => {
      const errorWithStatus = { status: 400, message: 'Bad request' };
      const mockCallHandler: CallHandler = {
        handle: () => throwError(() => errorWithStatus),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => done(),
      });
    });
  });
});
