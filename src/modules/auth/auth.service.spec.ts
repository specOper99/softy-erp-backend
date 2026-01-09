import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../../common/services/encryption.service';
import { GeoIpService } from '../../common/services/geoip.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { TenantsService } from '../tenants/tenants.service';
import { Role } from '../users/enums/role.enum';
import { UsersService } from '../users/services/users.service';
import { AuthService } from './auth.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AccountLockoutService } from './services/account-lockout.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';

// Test password constants
const TEST_PASSWORD = process.env.TEST_MOCK_PASSWORD || 'testpassword123';
const TEST_WRONG_PASSWORD =
  process.env.TEST_MOCK_PASSWORD_WRONG || 'wrongpassword';

describe('AuthService - Comprehensive Tests', () => {
  let service: AuthService;
  let _usersService: UsersService;
  let _tenantsService: TenantsService;

  const mockUser = {
    id: 'test-uuid-123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    role: Role.FIELD_STAFF,
    isActive: true,
    tenantId: 'tenant-123',
    isMfaEnabled: false,
    mfaSecret: null,
    recoveryCodes: [],
    emailVerified: true,
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
    findByEmailWithMfaSecret: jest.fn(),
    findOne: jest.fn(),
    validatePassword: jest.fn(),
    updateMfaSecret: jest.fn(),
    update: jest.fn(),
    updateMfaRecoveryCodes: jest.fn(),
    findByIdWithRecoveryCodes: jest.fn(),
  };

  const mockTenantsService = {
    create: jest.fn(),
    createWithManager: jest.fn(),
    findBySlug: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTokenService = {
    generateTokens: jest.fn().mockResolvedValue({
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 900,
    }),
    hashToken: jest.fn().mockReturnValue('mock-token-hash'),
    revokeToken: jest.fn().mockResolvedValue(undefined),
    revokeAllUserTokens: jest.fn().mockResolvedValue(3),
    revokeOtherSessions: jest.fn().mockResolvedValue(4),
    getActiveSessions: jest.fn().mockResolvedValue([]),
    cleanupExpiredTokens: jest.fn().mockResolvedValue(10),
  };

  const mockMfaService = {
    generateMfaSecret: jest.fn().mockResolvedValue({
      secret: 'SECRET',
      qrCodeUrl: 'data:image/png;base64,...',
    }),
    enableMfa: jest
      .fn()
      .mockResolvedValue([
        'code1',
        'code2',
        'code3',
        'code4',
        'code5',
        'code6',
        'code7',
        'code8',
        'code9',
        'code10',
      ]),
    disableMfa: jest.fn().mockResolvedValue(undefined),
    verifyRecoveryCode: jest.fn().mockResolvedValue(false),
    getRemainingRecoveryCodes: jest.fn().mockResolvedValue(10),
  };

  const mockSessionService = {
    getActiveSessions: jest.fn().mockResolvedValue([]),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    revokeOtherSessions: jest.fn().mockResolvedValue(4),
    logoutAllSessions: jest.fn().mockResolvedValue(5),
    checkNewDevice: jest.fn().mockResolvedValue(undefined),
    checkSuspiciousActivity: jest.fn().mockResolvedValue(undefined),
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

  const mockPasswordResetRepository = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailVerificationRepository = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockTransactionManager = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((token) => Promise.resolve(token)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockTransactionManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    manager: {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    },
    transaction: jest.fn().mockImplementation((callback) => {
      return callback(mockTransactionManager);
    }),
  };

  const mockMailService = {
    queuePasswordReset: jest.fn().mockResolvedValue(undefined),
    queueEmailVerification: jest.fn().mockResolvedValue(undefined),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockImplementation((s: string) => `encrypted-${s}`),
    decrypt: jest
      .fn()
      .mockImplementation((s: string) => s.replace(/^encrypted-/, '')),
  };

  const mockGeoIpService = {
    lookup: jest.fn().mockResolvedValue({
      country: 'US',
      city: 'New York',
      ll: [40.7128, -74.006],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: MfaService, useValue: mockMfaService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: GeoIpService, useValue: mockGeoIpService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetRepository,
        },
        {
          provide: getRepositoryToken(EmailVerificationToken),
          useValue: mockEmailVerificationRepository,
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
        { provide: MailService, useValue: mockMailService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        {
          provide: PasswordService,
          useValue: {
            forgotPassword: jest.fn().mockResolvedValue(undefined),
            resetPassword: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _usersService = module.get<UsersService>(UsersService);
    _tenantsService = module.get<TenantsService>(TenantsService);

    jest.clearAllMocks();

    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('should register new user and return auth response', async () => {
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
      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toHaveProperty('email', mockUser.email);
      expect(mockTenantsService.createWithManager).toHaveBeenCalled();
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

      expect(result.user!.role).toBe(Role.ADMIN);
    });

    it('should throw ConflictException if user already exists', async () => {
      mockTenantsService.findBySlug.mockRejectedValue(
        new NotFoundException('Not Found'),
      );
      mockTenantsService.createWithManager.mockResolvedValue(mockTenant);
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      await expect(service.register(dto)).rejects.toThrow(
        'Email already registered',
      );
    });

    it('should throw ConflictException if tenant/slug already exists', async () => {
      const error = new Error('Constraint violation');
      (error as any).code = '23505';
      mockTenantsService.createWithManager.mockRejectedValue(error);

      const dto = {
        email: 'new@example.com',
        password: TEST_PASSWORD,
        companyName: 'Test Tenant',
      };
      await expect(service.register(dto)).rejects.toThrow(
        'Tenant with this name or slug already exists',
      );
    });
  });

  describe('login', () => {
    it('should return auth response for valid credentials', async () => {
      mockUsersService.findByEmailWithMfaSecret.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);

      const dto = { email: 'test@example.com', password: TEST_PASSWORD };
      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user!.email).toBe(mockUser.email);
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      mockUsersService.findByEmailWithMfaSecret.mockResolvedValue(null);

      const dto = { email: 'notfound@example.com', password: TEST_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      mockUsersService.findByEmailWithMfaSecret.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(false);

      const dto = { email: 'test@example.com', password: TEST_WRONG_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockUsersService.findByEmailWithMfaSecret.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const dto = { email: 'test@example.com', password: TEST_PASSWORD };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return requiresMfa challenge if MFA is enabled but no code provided', async () => {
      mockUsersService.findByEmailWithMfaSecret.mockResolvedValue({
        ...mockUser,
        isMfaEnabled: true,
      });
      mockUsersService.validatePassword.mockResolvedValue(true);

      const dto = { email: 'mfa@example.com', password: TEST_PASSWORD };

      const result = await service.login(dto);
      expect(result).toHaveProperty('requiresMfa', true);
      expect(result.accessToken).toBeUndefined();
    });
  });

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

    it('should throw UnauthorizedException for tenant mismatch', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const payload = {
        sub: 'test-uuid-123',
        email: 'test@example.com',
        role: Role.FIELD_STAFF,
        tenantId: 'tenant-other',
      };

      await expect(service.validateUser(payload)).rejects.toThrow(
        UnauthorizedException,
      );
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
  });

  describe('logout', () => {
    it('should revoke specific token', async () => {
      await service.logout(mockUser.id, 'some-refresh-token');

      expect(mockTokenService.hashToken).toHaveBeenCalledWith(
        'some-refresh-token',
      );
      expect(mockTokenService.revokeToken).toHaveBeenCalledWith(
        'mock-token-hash',
        mockUser.id,
      );
    });

    it('should revoke all tokens when no specific token provided', async () => {
      await service.logout(mockUser.id);

      expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  describe('logoutAllSessions', () => {
    it('should revoke all active tokens', async () => {
      const result = await service.logoutAllSessions('u-1');
      expect(result).toBe(0);
    });
  });

  describe('getActiveSessions', () => {
    it('should return non-revoked non-expired sessions', async () => {
      const sessions = [{ id: 's1' }, { id: 's2' }];
      mockSessionService.getActiveSessions.mockResolvedValue(sessions);
      const result = await service.getActiveSessions('u-1');
      expect(mockSessionService.getActiveSessions).toHaveBeenCalledWith('u-1');
      expect(result).toEqual(sessions);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      mockTokenService.cleanupExpiredTokens.mockResolvedValue(10);
      const result = await service.cleanupExpiredTokens();
      expect(result).toBe(10);
    });
  });

  describe('MFA', () => {
    it('should generate MFA secret', async () => {
      const result = await service.generateMfaSecret(mockUser as any);
      expect(result.secret).toBe('SECRET');
      expect(result.qrCodeUrl).toBeDefined();
    });

    it('should enable MFA with valid token', async () => {
      const result = await service.enableMfa(mockUser as any, '123456');
      expect(result).toHaveLength(10);
    });

    it('should throw if MFA token invalid', async () => {
      mockMfaService.enableMfa.mockRejectedValue(
        new UnauthorizedException('Invalid MFA code'),
      );

      await expect(
        service.enableMfa(mockUser as any, '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should disable MFA', async () => {
      await service.disableMfa(mockUser as any);
      expect(mockMfaService.disableMfa).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('Email Verification', () => {
    it('should verify email with valid token', async () => {
      const mockToken = {
        id: 'token-uuid',
        email: 'test@example.com',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 100000),
        used: false,
        isExpired: () => false,
      };
      mockEmailVerificationRepository.findOne.mockResolvedValue(mockToken);
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockEmailVerificationRepository.save.mockResolvedValue({
        ...mockToken,
        used: true,
      });
      mockUsersService.update.mockResolvedValue(mockUser);

      const result = await service.verifyEmail('valid-token');

      expect(result).toBe(true);
      expect(mockUsersService.update).toHaveBeenCalledWith(mockUser.id, {
        emailVerified: true,
      });
    });

    it('should throw UnauthorizedException if token invalid', async () => {
      mockEmailVerificationRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token expired', async () => {
      const mockToken = {
        isExpired: () => true,
      };
      mockEmailVerificationRepository.findOne.mockResolvedValue(mockToken);

      await expect(service.verifyEmail('expired')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Forgot Password', () => {
    it('should delegate to PasswordService', async () => {
      const passwordService = (service as any).passwordService;

      await service.forgotPassword('test@example.com');

      expect(passwordService.forgotPassword).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('Reset Password', () => {
    it('should delegate to PasswordService with logout callback', async () => {
      const passwordService = (service as any).passwordService;

      await service.resetPassword('valid-token', 'NewPassword123!');

      expect(passwordService.resetPassword).toHaveBeenCalledWith(
        'valid-token',
        'NewPassword123!',
        expect.any(Function),
      );
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

    it('should throw UnauthorizedException if account is locked out', async () => {
      (service as any).lockoutService.isLockedOut = jest
        .fn()
        .mockResolvedValue({
          locked: true,
          remainingMs: 5000,
        });

      await expect(
        service.login({ email: 'a@a.com', password: 'p' }),
      ).rejects.toThrow('Account temporarily locked');
    });
  });
});
