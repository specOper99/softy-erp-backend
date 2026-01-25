import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { register } from 'prom-client';
import { createMockMetricsFactory } from '../../../../test/helpers/mock-factories';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { ClientAuthService } from './client-auth.service';

// Use string literal directly to avoid circular import from client-portal.module
const TENANT_REPO_CLIENT = 'TENANT_REPO_CLIENT';

describe('ClientAuthService', () => {
  let service: ClientAuthService;

  const mockTenantId = 'tenant-123';

  const createMockClient = (overrides = {}) => ({
    id: 'client-uuid-123',
    name: 'Test Client',
    email: 'test@example.com',
    tenantId: mockTenantId,
    accessTokenHash: null,
    accessTokenExpiry: null,
    isAccessTokenValid: jest.fn().mockReturnValue(true),
    ...overrides,
  });

  const mockClientRepository = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((client) => Promise.resolve(client)),
    create: jest.fn(),
    find: jest.fn(),
  };

  const mockMailService = {
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'auth.clientSessionExpires') return 3600;
      return defaultValue;
    }),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'auth.jwtSecret') return 'secret';
      if (key === 'JWT_PUBLIC_KEY') return 'pubkey';
      throw new Error(`Missing config: ${key}`);
    }),
  };

  const mockCacheManager = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockMetricsFactory = createMockMetricsFactory();
  const mockTenantsService = {
    findBySlug: jest.fn().mockResolvedValue({ id: mockTenantId, slug: 'acme' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        {
          provide: TENANT_REPO_CLIENT,
          useValue: mockClientRepository,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: MetricsFactory,
          useValue: mockMetricsFactory,
        },
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
      ],
    }).compile();

    service = module.get<ClientAuthService>(ClientAuthService);

    // Mock tenant context
    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(mockTenantId);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(mockTenantId);
    jest.clearAllMocks();
  });

  afterEach(() => {
    register.clear();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should return message when client exists', async () => {
      mockClientRepository.findOne.mockResolvedValue(createMockClient());
      mockJwtService.sign.mockReturnValueOnce('magic-jwt');

      const result = await service.requestMagicLink('acme', 'test@example.com');

      expect(result.message).toBe('If an account exists, a magic link has been sent.');
      expect(mockClientRepository.save).toHaveBeenCalled();
      expect(mockMailService.sendMagicLink).toHaveBeenCalledWith(expect.objectContaining({ token: 'magic-jwt' }));
      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          accessTokenExpiry: expect.any(Date),
        }),
      );
    });

    it('should return same message when client does not exist (security)', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      const result = await service.requestMagicLink('acme', 'nonexistent@example.com');

      expect(result.message).toBe('If an account exists, a magic link has been sent.');
      expect(mockClientRepository.save).not.toHaveBeenCalled();
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should store token hash (not plaintext) and set expiry', async () => {
      const clientCopy = createMockClient();
      mockClientRepository.findOne.mockResolvedValue(clientCopy);

      await service.requestMagicLink('acme', 'test@example.com');

      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hex
          accessTokenExpiry: expect.any(Date),
        }),
      );
    });

    it('should include tenant scoping in lookup', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      await service.requestMagicLink('acme', 'test@example.com');

      // Note: TenantAwareRepository adds tenantId internally, service just passes the where clause
      expect(mockClientRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should send magic link email with JWT token', async () => {
      mockClientRepository.findOne.mockResolvedValue(createMockClient());
      mockJwtService.sign.mockReturnValueOnce('magic-jwt');

      await service.requestMagicLink('acme', 'test@example.com');

      expect(mockMailService.sendMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          clientEmail: 'test@example.com',
          clientName: 'Test Client',
          token: 'magic-jwt',
          expiresInHours: 24,
        }),
      );
    });
  });

  describe('verifyMagicLink', () => {
    it('should return JWT session token for valid magic link', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client_magic',
        jti: 'magic-jti-123',
      });
      const tokenHash = createHash('sha256').update('magic-jti-123').digest('hex');
      const mockClient = createMockClient({
        accessTokenHash: tokenHash,
        accessTokenExpiry: new Date(Date.now() + 86400000),
      });
      mockClientRepository.findOne.mockResolvedValue(mockClient);

      const result = await service.verifyMagicLink('magic-jwt');

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.expiresIn).toBe(3600);
      expect(result.client).toBeDefined();
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'client-uuid-123',
          tenantId: mockTenantId,
          type: 'client',
        }),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException for non-existent token', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client_magic',
        jti: 'magic-jti-123',
      });
      mockClientRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyMagicLink('invalid-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client_magic',
        jti: 'magic-jti-123',
      });
      const tokenHash = createHash('sha256').update('magic-jti-123').digest('hex');
      const expiredClient = createMockClient({
        accessTokenHash: tokenHash,
        isAccessTokenValid: jest.fn().mockReturnValue(false),
      });
      mockClientRepository.findOne.mockResolvedValue(expiredClient);

      await expect(service.verifyMagicLink('magic-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('should clear token after verification (single-use)', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client_magic',
        jti: 'magic-jti-123',
      });
      const tokenHash = createHash('sha256').update('magic-jti-123').digest('hex');
      const mockClient = createMockClient({
        accessTokenHash: tokenHash,
        accessTokenExpiry: new Date(Date.now() + 86400000),
      });
      mockClientRepository.findOne.mockResolvedValue(mockClient);

      await service.verifyMagicLink('magic-jwt');

      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenHash: null,
          accessTokenExpiry: null,
        }),
      );
    });

    it('should include tenant scoping in lookup', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client_magic',
        jti: 'magic-jti-123',
      });
      mockClientRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyMagicLink('magic-jwt')).rejects.toThrow();

      // Note: TenantAwareRepository adds tenantId internally
      expect(mockClientRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'client-uuid-123' },
      });
    });
  });

  describe('validateClientToken', () => {
    it('should return null if token is blacklisted', async () => {
      mockCacheManager.get.mockResolvedValue('revoked');
      const result = await service.validateClientToken('blacklisted-token');
      expect(result).toBeNull();
      expect(mockCacheManager.get).toHaveBeenCalledWith(expect.stringMatching(/^blacklist:[a-f0-9]+$/));
    });

    it('should return client for valid JWT token', async () => {
      mockCacheManager.get.mockResolvedValue(null); // Not blacklisted
      const mockClient = createMockClient();
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: mockTenantId,
        type: 'client',
      });
      mockClientRepository.findOne.mockResolvedValue(mockClient);

      const result = await service.validateClientToken('valid-jwt');

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
    });

    it('should return null for invalid JWT', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await service.validateClientToken('invalid-jwt');

      expect(result).toBeNull();
    });

    it('should return null for non-client token type', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@example.com',
        tenantId: mockTenantId,
        type: 'user', // Not 'client'
      });

      const result = await service.validateClientToken('user-jwt');

      expect(result).toBeNull();
    });

    it('should return null for cross-tenant access attempt', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'client-uuid-123',
        email: 'test@example.com',
        tenantId: 'other-tenant', // Different tenant
        type: 'client',
      });

      const result = await service.validateClientToken('cross-tenant-jwt');

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should blacklist token in cache with correct TTL', async () => {
      const now = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
      const expiry = now + 3600; // 1 hour later

      mockJwtService.decode.mockReturnValue({ exp: expiry });

      const token = 'test-token';
      await service.logout(token);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringMatching(/^blacklist:[a-f0-9]+$/),
        'revoked',
        3600 * 1000,
      );
    });

    it('should ignore invalid tokens on logout', async () => {
      mockJwtService.decode.mockReturnValue(null);
      await service.logout('invalid-token');
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });
  });
});
