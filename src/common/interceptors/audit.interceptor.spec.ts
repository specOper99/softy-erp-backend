import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditOptions } from '../decorators/audit.decorator';
import { TenantContextService } from '../services/tenant-context.service';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let auditService: jest.Mocked<AuditService>;

  const mockRequest = {
    method: 'POST',
    path: '/api/v1/users',
    originalUrl: '/api/v1/users',
    headers: {
      'x-correlation-id': 'test-correlation-id',
      'user-agent': 'Jest Test Agent',
    },
    ip: '127.0.0.1',
    body: { name: 'Test', password: 'secret123' },
    params: { id: 'user-123' },
    user: { sub: 'user-456' },
  };

  const mockExecutionContext = {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => mockRequest,
    }),
    getHandler: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        Reflector,
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('false'),
          },
        },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    reflector = module.get<Reflector>(Reflector);
    auditService = module.get(AuditService);

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
    it('should skip if no @Audit decorator', (done) => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(auditService.log).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('should log audit event on success', (done) => {
      const auditOptions: AuditOptions = {
        action: 'CREATE',
        resource: 'user',
      };
      jest.spyOn(reflector, 'get').mockReturnValue(auditOptions);

      const mockCallHandler: CallHandler = {
        handle: () => of({ id: 'new-user-id' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'CREATE_USER',
              entityName: 'user',
            }),
          );
          done();
        },
      });
    });

    it('should log audit event on error', (done) => {
      const auditOptions: AuditOptions = {
        action: 'UPDATE',
        resource: 'user',
      };
      jest.spyOn(reflector, 'get').mockReturnValue(auditOptions);

      const mockCallHandler: CallHandler = {
        handle: () => throwError(() => new Error('Update failed')),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'UPDATE_USER',
              notes: 'Update failed',
            }),
          );
          done();
        },
      });
    });

    it('should include body when includeBody is true', (done) => {
      const auditOptions: AuditOptions = {
        action: 'CREATE',
        resource: 'user',
        includeBody: true,
      };
      jest.spyOn(reflector, 'get').mockReturnValue(auditOptions);

      const mockCallHandler: CallHandler = {
        handle: () => of({ id: 'new-id' }),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
              newValues: expect.objectContaining({
                requestBody: expect.objectContaining({
                  name: 'Test',
                  password: '[REDACTED]',
                }),
              }),
            }),
          );
          done();
        },
      });
    });

    it('should include response when includeResponse is true', (done) => {
      const auditOptions: AuditOptions = {
        action: 'READ',
        resource: 'user',
        includeResponse: true,
      };
      jest.spyOn(reflector, 'get').mockReturnValue(auditOptions);

      const responseData = { id: 'user-1', name: 'Test User' };
      const mockCallHandler: CallHandler = {
        handle: () => of(responseData),
      };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          expect(auditService.log).toHaveBeenCalledWith(
            expect.objectContaining({
              newValues: expect.objectContaining({
                responseData,
              }),
            }),
          );
          done();
        },
      });
    });

    it('should handle x-forwarded-for header when TRUST_PROXY is true', async () => {
      // Create a new module with TRUST_PROXY enabled
      const trustedModule = await Test.createTestingModule({
        providers: [
          AuditInterceptor,
          Reflector,
          {
            provide: AuditService,
            useValue: {
              log: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('true'), // TRUST_PROXY enabled
            },
          },
        ],
      }).compile();

      const trustedInterceptor =
        trustedModule.get<AuditInterceptor>(AuditInterceptor);
      const trustedReflector = trustedModule.get<Reflector>(Reflector);
      const trustedAuditService =
        trustedModule.get<jest.Mocked<AuditService>>(AuditService);

      const requestWithForwarded = {
        ...mockRequest,
        headers: {
          ...mockRequest.headers,
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      };

      const contextWithForwarded = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => requestWithForwarded,
        }),
        getHandler: jest.fn(),
      } as unknown as ExecutionContext;

      const auditOptions: AuditOptions = {
        action: 'READ',
        resource: 'test',
      };
      jest.spyOn(trustedReflector, 'get').mockReturnValue(auditOptions);

      const mockCallHandler: CallHandler = {
        handle: () => of({ data: 'test' }),
      };

      await new Promise<void>((resolve) => {
        trustedInterceptor
          .intercept(contextWithForwarded, mockCallHandler)
          .subscribe({
            complete: () => {
              expect(trustedAuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({
                  ipAddress: '192.168.1.1',
                }),
              );
              resolve();
            },
          });
      });
    });

    it('should handle audit service error gracefully', (done) => {
      const auditOptions: AuditOptions = {
        action: 'CREATE',
        resource: 'user',
      };
      jest.spyOn(reflector, 'get').mockReturnValue(auditOptions);
      auditService.log.mockRejectedValue(new Error('Audit failed'));

      const mockCallHandler: CallHandler = {
        handle: () => of({ id: 'new-id' }),
      };

      // Mock the NestJS Logger error method
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        complete: () => {
          setTimeout(() => {
            expect(loggerErrorSpy).toHaveBeenCalledWith(
              'Audit logging failed',
              expect.any(String),
            );
            loggerErrorSpy.mockRestore();
            done();
          }, 50);
        },
      });
    });
  });
});
