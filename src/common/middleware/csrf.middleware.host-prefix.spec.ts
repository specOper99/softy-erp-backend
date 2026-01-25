import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import { CsrfMiddleware } from './csrf.middleware';
import { doubleCsrf } from 'csrf-csrf';

// Mock doubleCsrf
jest.mock('csrf-csrf', () => ({
  doubleCsrf: jest.fn((options) => ({
    doubleCsrfProtection: jest.fn((req, _res, next) => {
      const token = options?.getCsrfTokenFromRequest?.(req);
      if (token !== 'valid-token') {
        next(new Error('Invalid CSRF token'));
      } else {
        next();
      }
    }),
    generateCsrfToken: jest.fn(() => 'generated-token'),
  })),
}));

type TestRequest = {
  path: string;
  method: string;
  headers: Record<string, unknown>;
  cookies: Record<string, unknown>;
  body: Record<string, unknown>;
};

describe('CsrfMiddleware - Production Hardening', () => {
  let middleware: CsrfMiddleware;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockReq: TestRequest;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockReq = {
      path: '/api/v1/test',
      method: 'POST',
      headers: {},
      cookies: {},
      body: {},
    };

    mockRes = {
      cookie: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Partial<Response>;

    mockNext = jest.fn();

    // Default config for development
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'CSRF_ENABLED':
          return true;
        case 'NODE_ENV':
          return 'production';
        case 'CSRF_SECRET':
          return 'a'.repeat(32); // Valid production secret
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfMiddleware,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    middleware = module.get<CsrfMiddleware>(CsrfMiddleware);
  });

  describe('__Host- cookie prefix in production', () => {
    it('should configure __Host-csrf cookie in production', () => {
      expect(doubleCsrf).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: '__Host-csrf',
          cookieOptions: expect.objectContaining({
            httpOnly: true,
            sameSite: 'strict',
            secure: true,
            path: '/',
          }),
        }),
      );
    });

    it('should enforce secure flag in production', () => {
      mockReq = { ...mockReq, method: 'GET' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({
          secure: true,
        }),
      );
    });

    it('should enforce sameSite strict in production', () => {
      mockReq = { ...mockReq, method: 'GET' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({
          sameSite: 'strict',
        }),
      );
    });

    it('should enforce path=/ in production', () => {
      mockReq = { ...mockReq, method: 'GET' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({
          path: '/',
        }),
      );
    });
  });

  describe('token extraction safety', () => {
    it('should reject non-string CSRF tokens', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': 123 },
        body: {},
      };

      expect(() => middleware.use(mockReq as Request, mockRes as Response, mockNext)).toThrow(ForbiddenException);
    });

    it('should reject empty string CSRF tokens', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': '' },
        body: {},
      };

      expect(() => middleware.use(mockReq as Request, mockRes as Response, mockNext)).toThrow(ForbiddenException);
    });

    it('should reject array CSRF tokens', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': ['token1', 'token2'] },
        body: {},
      };

      expect(() => middleware.use(mockReq as Request, mockRes as Response, mockNext)).toThrow(ForbiddenException);
    });

    it('should accept valid string CSRF token', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': 'valid-token' },
        body: {},
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept CSRF token from body', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': undefined },
        body: { _csrf: 'valid-token' },
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject CSRF token from body if empty string', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), cookie: 'XSRF-TOKEN=mock', 'x-csrf-token': undefined },
        body: { _csrf: '' },
      };

      expect(() => middleware.use(mockReq as Request, mockRes as Response, mockNext)).toThrow(ForbiddenException);
    });
  });

  describe('excluded paths', () => {
    it('should skip webhooks path', () => {
      mockReq = { ...mockReq, path: '/api/v1/webhooks', method: 'POST' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip billing webhooks path', () => {
      mockReq = { ...mockReq, path: '/api/v1/billing/webhooks', method: 'POST' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip health path', () => {
      mockReq = { ...mockReq, path: '/api/v1/health', method: 'GET' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip metrics path', () => {
      mockReq = { ...mockReq, path: '/api/v1/metrics', method: 'GET' };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('API request detection', () => {
    it('should skip if Bearer token present with no cookies', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), authorization: 'Bearer valid-jwt', cookie: undefined },
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip if API key present with no cookies', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), 'x-api-key': 'valid-api-key', cookie: undefined },
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip if client token present with no cookies', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), 'x-client-token': 'valid-client-token', cookie: undefined },
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should NOT skip if Bearer token present WITH cookies', () => {
      mockReq = {
        ...mockReq,
        method: 'POST',
        headers: { ...(mockReq.headers ?? {}), authorization: 'Bearer valid-jwt', cookie: 'session_id=abc123' },
      };

      middleware.use(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
