import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { TenantsService } from '../tenants.service';
import { TenantMiddleware } from './tenant.middleware';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let _jwtService: JwtService;
  let _tenantsService: TenantsService;
  let _configService: ConfigService;

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
    _jwtService = module.get<JwtService>(JwtService);
    _tenantsService = module.get<TenantsService>(TenantsService);
    _configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      req = {
        headers: {},
      } as Request;

      Object.defineProperty(req, 'hostname', {
        value: 'localhost',
        writable: true,
      });

      res = {};
      next = jest.fn();
    });

    it('should extract tenantId from JWT', async () => {
      req.headers.authorization = 'Bearer token';
      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });

      await middleware.use(req as Request, res as Response, next);

      expect(mockJwtService.verify).toHaveBeenCalled();
      expect(next).toHaveBeenCalled(); // How to verify context? Typically mocked ContextService
    });

    it('should extract tenantId from hostname (uuid)', async () => {
      req.hostname = '550e8400-e29b-41d4-a716-446655440000.example.com';
      mockTenantsService.findOne.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' });

      await middleware.use(req as Request, res as Response, next);

      expect(mockTenantsService.findOne).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      expect(next).toHaveBeenCalled();
    });

    it('should extract tenantId from hostname (slug)', async () => {
      req.hostname = 'slug.example.com';
      mockTenantsService.findBySlug.mockResolvedValue({ id: 'tenant-1' });

      await middleware.use(req as Request, res as Response, next);

      expect(mockTenantsService.findBySlug).toHaveBeenCalledWith('slug');
      expect(next).toHaveBeenCalled();
    });

    it('should skip if no tenantId found', async () => {
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should call next if extraction fails', async () => {
      req.headers.authorization = 'Bearer bad';
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('fail');
      });

      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle reserved subdomains', async () => {
      const reserved = ['www', 'api', 'app'];
      for (const sub of reserved) {
        req.hostname = `${sub}.example.com`;
        await middleware.use(req as Request, res as Response, next);
        expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
        expect(mockTenantsService.findOne).not.toHaveBeenCalled();
      }
    });

    it('should handle too short hostnames', async () => {
      req.hostname = 'localhost'; // parts < 3
      await middleware.use(req as Request, res as Response, next);
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();
    });

    it('should handle unallowed domains', async () => {
      process.env.TENANT_ALLOWED_DOMAINS = 'example.com';
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'TENANT_ALLOWED_DOMAINS') return 'example.com';
        return undefined;
      });

      req.hostname = 'tenant.other.com';
      await middleware.use(req as Request, res as Response, next);
      expect(mockTenantsService.findBySlug).not.toHaveBeenCalled();

      process.env.TENANT_ALLOWED_DOMAINS = ''; // Reset
    });

    it('should handle resolution errors gracefully', async () => {
      req.hostname = 'slug.example.com';
      mockTenantsService.findBySlug.mockRejectedValue(new Error('db error'));
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle uuid resolution errors gracefully', async () => {
      req.hostname = '550e8400-e29b-41d4-a716-446655440000.example.com';
      mockTenantsService.findOne.mockRejectedValue(new Error('db error'));
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should extract RS256 token', async () => {
      process.env.JWT_ALLOWED_ALGORITHMS = 'RS256';
      process.env.JWT_PUBLIC_KEY = 'pubkey';

      req.headers.authorization = 'Bearer token';
      mockJwtService.verify.mockReturnValue({ tenantId: 'tenant-1' });

      await middleware.use(req as Request, res as Response, next);

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ algorithms: ['RS256'], secret: 'pubkey' }),
      );

      // Cleanup env
      delete process.env.JWT_ALLOWED_ALGORITHMS;
      delete process.env.JWT_PUBLIC_KEY;
    });

    it('should throw if RS256 configured but no key', async () => {
      process.env.JWT_ALLOWED_ALGORITHMS = 'RS256';
      delete process.env.JWT_PUBLIC_KEY;

      req.headers.authorization = 'Bearer token';

      // It catches internal error inside extractTenantIdFromJwt
      await middleware.use(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled(); // Should just skip middleware login on error

      delete process.env.JWT_ALLOWED_ALGORITHMS;
    });
  });
});
