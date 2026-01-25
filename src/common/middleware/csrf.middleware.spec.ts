import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { CsrfMiddleware } from './csrf.middleware';

jest.mock('csrf-csrf', () => ({
  doubleCsrf: jest.fn(() => ({
    doubleCsrfProtection: (req: any, _res: any, callback: any) => {
      if (req.mockCsrfError) {
        const error = new Error('invalid csrf token');
        callback(error);
      } else {
        callback();
      }
    },
    generateCsrfToken: jest.fn(() => 'mock-csrf-token'),
  })),
}));

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfMiddleware,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'CSRF_ENABLED') return true;
              if (key === 'NODE_ENV') return 'development';
              if (key === 'CSRF_SECRET') return 'test-secret';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    middleware = module.get<CsrfMiddleware>(CsrfMiddleware);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should skip when CSRF is disabled', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'CSRF_ENABLED') return 'false';
        return undefined;
      });

      const disabledMiddleware = new CsrfMiddleware(configService);

      const mockRequest = { path: '/api/v1/test' } as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      disabledMiddleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip excluded paths (webhooks)', () => {
      const mockRequest = { path: '/api/v1/webhooks/stripe' } as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip auth endpoints', () => {
      const mockRequest = { path: '/api/v1/auth/login', method: 'POST' } as unknown as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip health endpoint', () => {
      const mockRequest = { path: '/api/v1/health' } as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip API requests with Bearer token', () => {
      const mockRequest = {
        path: '/api/v1/users',
        headers: { authorization: 'Bearer token123' },
      } as unknown as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip API requests with API key', () => {
      const mockRequest = {
        path: '/api/v1/users',
        headers: { 'x-api-key': 'api-key-123' },
      } as unknown as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip API requests with client token', () => {
      const mockRequest = {
        path: '/api/v1/client-portal/bookings',
        headers: { 'x-client-token': 'client-token-123' },
      } as unknown as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should generate token for GET requests', () => {
      const mockRequest = {
        path: '/api/v1/form',
        method: 'GET',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should apply CSRF protection for POST requests', () => {
      const mockRequest = {
        path: '/api/v1/form-submit',
        method: 'POST',
        headers: { cookie: 'XSRF-TOKEN=mock' },
        cookies: {},
        body: {},
      } as unknown as Request;
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for invalid CSRF token', () => {
      const mockRequest = {
        path: '/api/v1/form-submit',
        method: 'POST',
        headers: { cookie: 'XSRF-TOKEN=mock' },
        cookies: {},
        body: {},
        mockCsrfError: true,
      } as unknown as Request;
      const mockResponse = {} as unknown as Response;
      const mockNext = jest.fn();

      expect(() => {
        middleware.use(mockRequest, mockResponse, mockNext);
      }).toThrow(ForbiddenException);
    });

    it('should reject cross-site state-changing requests via Fetch Metadata', () => {
      const mockRequest = {
        path: '/api/v1/form-submit',
        method: 'POST',
        headers: {
          'sec-fetch-site': 'cross-site',
          origin: 'https://attacker.example',
          cookie: 'XSRF-TOKEN=mock',
        },
        cookies: {},
        body: {},
      } as unknown as Request;
      const mockResponse = {} as Response;
      const mockNext = jest.fn();

      expect(() => middleware.use(mockRequest, mockResponse, mockNext)).toThrow(ForbiddenException);
      expect(mockNext).not.toHaveBeenCalled();
    });
    it('logs when CSRF token generation throws', () => {
      const mockRequest = {
        path: '/api/v1/form',
        method: 'GET',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;
      const mockNext = jest.fn();

      (middleware as any).generateCsrfToken = jest.fn(() => {
        throw new Error('Token generation error');
      });

      const loggerSpy = jest.spyOn((middleware as any).logger, 'warn');

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('CSRF token generation failed'));
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('CSRF token generation retry failed'));
      expect(mockNext).toHaveBeenCalled();
    });

    it('fails closed in production if CSRF token cannot be generated', () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CSRF_ENABLED') return true;
        if (key === 'NODE_ENV') return 'production';
        if (key === 'CSRF_SECRET') return 'a'.repeat(32);
        return defaultValue;
      });

      const prodMiddleware = new CsrfMiddleware(configService);

      const mockRequest = {
        path: '/api/v1/form',
        method: 'GET',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const mockResponse = {
        cookie: jest.fn(),
      } as unknown as Response;
      const mockNext = jest.fn();

      (prodMiddleware as any).generateCsrfToken = jest.fn(() => {
        throw new Error('Token generation error');
      });

      expect(() => prodMiddleware.use(mockRequest, mockResponse, mockNext)).toThrow('CSRF token unavailable');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip CSRF for Bearer requests even when cookies are present', () => {
      const mockRequest = {
        path: '/api/v1/users',
        method: 'POST',
        headers: { authorization: 'Bearer token123', cookie: 'XSRF-TOKEN=mock' },
        cookies: {},
        body: {},
      } as unknown as Request;
      const mockResponse = {} as unknown as Response;
      const mockNext = jest.fn();

      middleware.use(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
