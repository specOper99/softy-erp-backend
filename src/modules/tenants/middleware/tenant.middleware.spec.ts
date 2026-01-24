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

    it('should extract tenantId from hostname (uuid)', async () => {
      setHostname('550e8400-e29b-41d4-a716-446655440000.example.com');
      mockTenantsService.findOne.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findOne).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      expect(next).toHaveBeenCalled();
    });

    it('should extract tenantId from hostname (slug)', async () => {
      setHostname('slug.example.com');
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findBySlug).toHaveBeenCalledWith('slug');
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

    it('should not deny JWT when hostname uuid tenant does not exist', async () => {
      setAuthHeader('Bearer token');
      const hostUuid = '550e8400-e29b-41d4-a716-446655440000';
      setHostname(`${hostUuid}.example.com`);

      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });
      mockTenantsService.findOne.mockRejectedValue(new Error('not found'));

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findOne).toHaveBeenCalledWith(hostUuid);
      expect(next).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request when JWT tenantId does not match hostname-derived tenantId', async () => {
      setAuthHeader('Bearer token');
      const hostUuid = '550e8400-e29b-41d4-a716-446655440000';
      setHostname(`${hostUuid}.example.com`);

      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });
      mockTenantsService.findOne.mockResolvedValue({ id: hostUuid });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findOne).toHaveBeenCalledWith(hostUuid);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'tenants.tenant_mismatch',
        }),
      );
    });

    it('should allow request when JWT tenantId matches hostname-derived tenantId', async () => {
      setAuthHeader('Bearer token');
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      setHostname(`${tenantId}.example.com`);

      mockJwtService.verify.mockReturnValue({ tenantId });
      mockTenantsService.findOne.mockResolvedValue({ id: tenantId });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findOne).toHaveBeenCalledWith(tenantId);
      expect(next).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle reserved subdomains', async () => {
      const reserved = ['www', 'api', 'app'];
      for (const sub of reserved) {
        setHostname(`${sub}.example.com`);
        await middleware.use(req as unknown as Request, res, next);
        expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
        expect(mockTenantsService.findOne).not.toHaveBeenCalled();
      }
    });

    it('should handle too short hostnames', async () => {
      setHostname('localhost'); // parts < 3
      await middleware.use(req as unknown as Request, res, next);
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
    });

    it('should handle unallowed domains', async () => {
      process.env.TENANT_ALLOWED_DOMAINS = 'example.com';
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'TENANT_ALLOWED_DOMAINS') return 'example.com';
        return undefined;
      });

      setHostname('tenant.other.com');
      await middleware.use(req as unknown as Request, res, next);
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();

      process.env.TENANT_ALLOWED_DOMAINS = ''; // Reset
    });

    it('should deny host-based tenant resolution when allowlist is empty in production', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'TENANT_ALLOWED_DOMAINS') return '';
        if (key === 'auth.jwtSecret') return 'secret';
        return defaultValue;
      });

      setHostname('slug.example.com');
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
    });

    it('should allow hostname match regardless of case', async () => {
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'TENANT_ALLOWED_DOMAINS') return 'Example.COM';
        return undefined;
      });

      setHostname('slug.EXAMPLE.com');
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as unknown as Request, res, next);

      expect(mockTenantsService.findBySlug).toHaveBeenCalledWith('slug');
      expect(next).toHaveBeenCalled();
    });

    it('should handle resolution errors gracefully', async () => {
      setHostname('slug.example.com');
      mockTenantsService.findBySlug.mockRejectedValue(new Error('db error'));
      await middleware.use(req as unknown as Request, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle uuid resolution errors gracefully', async () => {
      setHostname('550e8400-e29b-41d4-a716-446655440000.example.com');
      mockTenantsService.findOne.mockRejectedValue(new Error('db error'));
      await middleware.use(req as unknown as Request, res, next);
      expect(next).toHaveBeenCalled();
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
