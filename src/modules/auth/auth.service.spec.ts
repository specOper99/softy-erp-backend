import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AccountLockoutService } from './services/account-lockout.service';

// Test password constants - not real credentials, used only for unit test mocking
const TEST_PASSWORD = process.env.TEST_MOCK_PASSWORD!;
const TEST_WRONG_PASSWORD = process.env.TEST_MOCK_PASSWORD_WRONG!;

describe('AuthService - Comprehensive Tests', () => {
  let service: AuthService;
  let _usersService: UsersService;
  let _jwtService: JwtService;
  let _tenantsService: TenantsService;

  const mockUser = {
    id: 'test-uuid-123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    role: Role.FIELD_STAFF,
    isActive: true,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    subscriptionPlan: 'FREE',
    status: 'ACTIVE',
  };

  const mockUsersService = {
    create: jest.fn(),
    createWithManager: jest.fn(),
    findByEmail: jest.fn(),
    findOne: jest.fn(),
    validatePassword: jest.fn(),
  };

  const mockTenantsService = {
    create: jest.fn(),
    createWithManager: jest.fn(),
    findBySlug: jest.fn(),
    findOne: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'JWT_ACCESS_EXPIRES_SECONDS') return 900;
      if (key === 'JWT_REFRESH_EXPIRES_DAYS') return 7;
      return defaultValue;
    }),
  };

  const mockRefreshTokenRepository = {
    create: jest
      .fn()
      .mockImplementation((data) => ({ id: 'token-id', ...data })),
    save: jest.fn().mockImplementation((token) => Promise.resolve(token)),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    find: jest.fn().mockResolvedValue([]),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: AccountLockoutService,
          useValue: {
            isLockedOut: jest.fn().mockResolvedValue({ locked: false }),
            recordFailedAttempt: jest.fn().mockResolvedValue(false),
            clearAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _usersService = module.get<UsersService>(UsersService);
    _jwtService = module.get<JwtService>(JwtService);
    _tenantsService = module.get<TenantsService>(TenantsService);

    // Reset mocks
    jest.clearAllMocks();

    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');
  });

  // ============ REGISTRATION TESTS ============
  describe('register', () => {
    it('should register new user and return auth response', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      ); // Simulate not found which is caught and ignored
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockResolvedValue(mockUser);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toHaveProperty('email', mockUser.email);
      expect(mockTenantsService.createWithManager).toHaveBeenCalled();
    });

    it('should call usersService.createWithManager with dto and tenantId', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockResolvedValue(mockUser);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      await service.register(dto);

      expect(mockUsersService.createWithManager).toHaveBeenCalledWith(
        expect.anything(), // EntityManager
        expect.objectContaining({
          email: dto.email,
          tenantId: mockTenant.id,
        }),
      );
    });

    it('should create user with ADMIN role when specified', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockResolvedValue({
        ...mockUser,
        role: Role.ADMIN,
      });

      const dto = {
        email: 'admin@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };

      const result = await service.register(dto as any);

      expect(result.user.role).toBe(Role.ADMIN);
    });

    it('should generate JWT token with expiry option', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockResolvedValue(mockUser);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      await service.register(dto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id }),
        expect.objectContaining({ expiresIn: 900 }),
      );
    });

    it('should store refresh token in database', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockResolvedValue(mockUser);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      await service.register(dto);

      expect(mockRefreshTokenRepository.create).toHaveBeenCalled();
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });
  });

  it('should throw BadRequestException if tenant/slug already exists', async () => {
    mockTenantsService.findBySlug.mockResolvedValue(mockTenant); // Tenant found
    const dto = {
      email: 'new@example.com',
      password: TEST_PASSWORD,
      companyName: 'Test Tenant',
    };
    await expect(service.register(dto)).rejects.toThrow(
      'Organization name already taken',
    );
  });

  it('should throw BadRequestException if user already exists in tenant', async () => {
    mockTenantsService.findBySlug.mockRejectedValue(
      new NotFoundException('Not Found'),
    );
    mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
    mockUsersService.findByEmail.mockResolvedValue(mockUser); // User found

    const dto = {
      email: 'new@example.com',
      password: TEST_PASSWORD,
      companyName: 'Test Tenant',
    };
    await expect(service.register(dto)).rejects.toThrow(
      'Email already registered in this organization',
    );
  });

  // ============ LOGIN TESTS ============
  describe('login', () => {
    it('should return auth response for valid credentials', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue('tenant-123');
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);

      const dto = { email: 'test@example.com', password: TEST_PASSWORD };
      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const dto = { email: 'notfound@example.com', password: TEST_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(false);

      const dto = { email: 'test@example.com', password: TEST_WRONG_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const dto = { email: 'test@example.com', password: TEST_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return correct role in response for ADMIN', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUser,
        role: Role.ADMIN,
      });
      mockUsersService.validatePassword.mockResolvedValue(true);

      const dto = { email: 'admin@example.com', password: TEST_PASSWORD };
      const result = await service.login(dto);

      expect(result.user.role).toBe(Role.ADMIN);
    });
  });

  // ============ REFRESH TOKEN TESTS ============
  describe('refreshTokens', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        tokenHash: 'hash',
        userId: mockUser.id,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000), // Expired
        isExpired: () => true,
        isValid: () => false,
        user: mockUser,
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for revoked token', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        tokenHash: 'hash',
        userId: mockUser.id,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 86400000),
        isExpired: () => false,
        isValid: () => false,
        user: mockUser,
      });

      await expect(service.refreshTokens('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate tokens for valid refresh token', async () => {
      const mockToken = {
        tokenHash: 'hash',
        userId: mockUser.id,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        isExpired: () => false,
        isValid: () => true,
        user: mockUser,
      };
      mockRefreshTokenRepository.findOne.mockResolvedValue(mockToken);
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.refreshTokens('valid-token');

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
      expect(mockToken.isRevoked).toBe(true);
    });

    it('should throw UnauthorizedException if user not found or inactive during refresh', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        tokenHash: 'hash',
        userId: mockUser.id,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        isExpired: () => false,
        isValid: () => true,
        user: { ...mockUser, isActive: false },
      });

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ============ LOGOUT TESTS ============
  describe('logout', () => {
    it('should revoke specific token', async () => {
      await service.logout(mockUser.id, 'some-refresh-token');

      expect(mockRefreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should revoke all tokens when no specific token provided', async () => {
      await service.logout(mockUser.id);

      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, isRevoked: false },
        { isRevoked: true },
      );
    });
  });

  // ============ TOKEN VALIDATION TESTS ============
  describe('validateUser', () => {
    it('should return user for valid payload', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const payload = {
        sub: 'test-uuid-123',
        email: 'test@example.com',
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-123',
      };
      const result = await service.validateUser(payload);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);

      const payload = {
        sub: 'invalid-id',
        email: 'test@example.com',
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-123',
      };
      await expect(service.validateUser(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const payload = {
        sub: 'test-uuid-123',
        email: 'test@example.com',
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-123',
      };
      await expect(service.validateUser(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logoutAllSessions', () => {
    it('should revoke all active tokens', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 5 });
      const result = await service.logoutAllSessions('u-1');
      expect(result).toBe(5);
    });
  });

  describe('getActiveSessions', () => {
    it('should return non-revoked non-expired sessions', async () => {
      mockRefreshTokenRepository.find.mockResolvedValue([]);
      await service.getActiveSessions('u-1');
      expect(mockRefreshTokenRepository.find).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      mockRefreshTokenRepository.delete.mockResolvedValue({ affected: 10 });
      const result = await service.cleanupExpiredTokens();
      expect(result).toBe(10);
    });
  });

  describe('token reuse attack detection', () => {
    it('should revoke all tokens if a revoked token is used', async () => {
      const revokedToken = {
        userId: 'u-1',
        isRevoked: true,
        isValid: () => false,
      };
      mockRefreshTokenRepository.findOne.mockResolvedValue(revokedToken);

      await expect(service.refreshTokens('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.update).toHaveBeenCalled();
    });
  });

  describe('register conflict handling', () => {
    it('should throw BadRequestException on database unique constraint error', async () => {
      class DBError extends Error {
        code = '23505';
      }
      mockTenantsService.findBySlug.mockRejectedValue(
        new BadRequestException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockRejectedValue(new DBError());
      await expect(
        service.register({
          email: 'taken@e.com',
          password: 'p',
          companyName: 'T',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rethrow non-conflict errors during registration', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createWithManager.mockRejectedValue(
        new Error('DB Down'),
      );
      await expect(
        service.register({ email: 'e@e.com', password: 'p', companyName: 'T' }),
      ).rejects.toThrow('DB Down');
    });
  });

  describe('Edge Cases', () => {
    it('should throw UnauthorizedException if user is inactive in validateUser', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUsersService.findOne.mockResolvedValue(inactiveUser);
      await expect(service.validateUser({ sub: 'u-1' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handled undefined affected rows in logoutAllSessions', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({});
      const result = await service.logoutAllSessions('u-1');
      expect(result).toBe(0);
    });

    it('should handle undefined affected rows in cleanupExpiredTokens', async () => {
      mockRefreshTokenRepository.delete.mockResolvedValue({});
      const result = await service.cleanupExpiredTokens();
      expect(result).toBe(0);
    });

    it('should use fallback for userAgent if context missing', async () => {
      mockUsersService.createWithManager.mockResolvedValue(mockUser);
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockUsersService.findByEmail.mockResolvedValue(null);

      await service.register(
        { email: 'e2@e.com', password: 'p', companyName: 'c2' },
        undefined,
      ); // No context

      expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: null,
          ipAddress: null,
        }),
      );
    });

    it('should throw BadRequestException if login missing tenant context', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue(undefined);
      await expect(
        service.login({ email: 'a@a.com', password: 'p' }),
      ).rejects.toThrow('Missing Tenant Context');
    });

    it('should throw UnauthorizedException if account is locked out', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue('tenant-1');
      (
        service['lockoutService'].isLockedOut as jest.Mock
      ).mockResolvedValueOnce({
        locked: true,
        remainingMs: 5000,
      });

      await expect(
        service.login({ email: 'a@a.com', password: 'p' }),
      ).rejects.toThrow('Account temporarily locked');
    });

    it('should handle undefined remainingMs when locked out', async () => {
      jest
        .spyOn(TenantContextService, 'getTenantId')
        .mockReturnValue('tenant-1');
      (
        service['lockoutService'].isLockedOut as jest.Mock
      ).mockResolvedValueOnce({
        locked: true,
        // remainingMs undefined
      });

      await expect(
        service.login({ email: 'a@a.com', password: 'p' }),
      ).rejects.toThrow('Account temporarily locked');
    });

    it('should throw BadRequestException on email collision (23505) during register', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      const error = new Error('Collision');
      (error as any).code = '23505';
      mockUsersService.createWithManager.mockRejectedValue(error);

      await expect(
        service.register({ email: 'e@e.com', password: 'p', companyName: 'c' }),
      ).rejects.toThrow('Email already registered');
    });

    it('should use provided context values', async () => {
      mockUsersService.createWithManager.mockResolvedValue(mockUser);
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockTenantsService.findBySlug.mockResolvedValue(null);
      // Wait, findBySlug needs to throw NotFound to pass checks
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );

      await service.register(
        { email: 'e3@e.com', password: 'p', companyName: 'c3' },
        { userAgent: 'test-agent', ipAddress: '1.2.3.4' },
      );

      expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'test-agent',
          ipAddress: '1.2.3.4',
        }),
      );
    });
  });
});
