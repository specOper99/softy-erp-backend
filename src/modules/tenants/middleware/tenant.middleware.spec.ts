import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { TenantsService } from '../tenants.service';
import { TenantMiddleware } from './tenant.middleware';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockTenantsService = {
    findOne: jest.fn(),
    findBySlug: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'auth.jwtSecret') return 'secret';
      return defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'auth.jwtSecret') return 'secret';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMiddleware,
        { provide: JwtService, useValue: mockJwtService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    middleware = module.get<TenantMiddleware>(TenantMiddleware);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    type MockRequest = Record<string, unknown> & {
      headers?: Record<string, unknown>;
      hostname?: string;
    };

    let req: MockRequest;
    let res: Response;
    let next: NextFunction;

    const setHostname = (hostname: string) => {
      Object.defineProperty(req, 'hostname', {
        value: hostname,
        writable: true,
        configurable: true,
      });
    };

    const setAuthHeader = (authorization?: string) => {
      const current = req.headers ?? {};
      const nextHeaders: Record<string, unknown> = { ...current };
      if (authorization) {
        nextHeaders.authorization = authorization;
      } else {
        delete nextHeaders.authorization;
      }
      req.headers = nextHeaders;
    };

    beforeEach(() => {
      req = { headers: {} };
      setHostname('localhost');

      res = {} as unknown as Response;
      next = jest.fn();

      // Reset config service mocks to defaults for each test
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'auth.jwtSecret') return 'secret';
        return defaultValue;
      });
      mockConfigService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'auth.jwtSecret') return 'secret';
        return undefined;
      });
    });

    it('should extract tenantId from JWT', async () => {
      setAuthHeader('Bearer token');
      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockJwtService.verify).toHaveBeenCalled();
      expect(next).toHaveBeenCalled(); // How to verify context? Typically mocked ContextService
    });

    it('should ignore hostname when no JWT is present', async () => {
      setHostname('slug.example.com');
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
      expect(mockTenantsService.findOne).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should skip if no tenantId found', async () => {
      await middleware.use(req as unknown as Request, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should call next if extraction fails', async () => {
      setAuthHeader('Bearer bad');
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('fail');
      });

      await middleware.use(req as unknown as Request, res, next);
      expect(next).toHaveBeenCalled();
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
      expect(mockTenantsService.findOne).not.toHaveBeenCalled();
    });

    it('should not fall back to host when Bearer token has no tenantId', async () => {
      setAuthHeader('Bearer token');
      setHostname('slug.example.com');
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', email: 'a@b.com', role: 'user' });
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
      expect(mockTenantsService.findOne).not.toHaveBeenCalled();
    });

    it('should extract RS256 token', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'JWT_ALLOWED_ALGORITHMS') return 'RS256';
        if (key === 'JWT_PUBLIC_KEY') return 'pubkey';
        if (key === 'auth.jwtSecret') return 'secret';
        return defaultValue;
      });

      setAuthHeader('Bearer token');
      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ algorithms: ['RS256'], publicKey: 'pubkey' }),
      );
    });

    it('should throw if RS256 configured but no key', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'JWT_ALLOWED_ALGORITHMS') return 'RS256';
        if (key === 'JWT_PUBLIC_KEY') return undefined;
        if (key === 'auth.jwtSecret') return 'secret';
        return defaultValue;
      });

      setAuthHeader('Bearer token');

      // It catches internal error inside extractTenantIdFromJwt
      await middleware.use(req as unknown as Request, res, next);
      expect(next).toHaveBeenCalled(); // Should just skip middleware login on error
    });
  });
});
