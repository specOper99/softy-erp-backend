import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformAuditLog } from '../entities/platform-audit-log.entity';
import { PlatformSession } from '../entities/platform-session.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { PlatformRole } from '../enums/platform-role.enum';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthService } from './platform-auth.service';
import { MFAService } from './mfa.service';
import { PlatformMfaTokenService } from './platform-mfa-token.service';

describe('PlatformAuthService', () => {
  let service: PlatformAuthService;
  let userRepository: Repository<PlatformUser>;
  let sessionRepository: Repository<PlatformSession>;
  let jwtService: JwtService;
  let passwordHashService: PasswordHashService;
  let auditService: PlatformAuditService;
  let platformMfaTokenService: PlatformMfaTokenService;

  const mockUser: Partial<PlatformUser> = {
    id: 'user-123',
    email: 'admin@platform.com',
    fullName: 'Admin User',
    passwordHash: '$argon2id$hashed_password',
    role: PlatformRole.SUPER_ADMIN,
    status: 'active',
    mfaEnabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ipAllowlist: [],
  };

  const mockSession: Partial<PlatformSession> = {
    id: 'session-123',
    userId: 'user-123',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    sessionToken: 'token',
    refreshToken: 'refresh',
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    isRevoked: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAuthService,
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlatformSession),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: PasswordHashService,
          useValue: {
            verify: jest.fn(),
            verifyAndUpgrade: jest.fn(),
            hash: jest.fn(),
          },
        },
        {
          provide: PlatformAuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: MFAService,
          useValue: {
            verifyToken: jest.fn(),
            verifyBackupCode: jest.fn(),
            removeUsedBackupCode: jest.fn(),
          },
        },
        {
          provide: PlatformMfaTokenService,
          useValue: {
            create: jest.fn(),
            consume: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformAuthService>(PlatformAuthService);
    userRepository = module.get(getRepositoryToken(PlatformUser));
    sessionRepository = module.get(getRepositoryToken(PlatformSession));
    jwtService = module.get<JwtService>(JwtService);
    passwordHashService = module.get<PasswordHashService>(PasswordHashService);
    auditService = module.get<PlatformAuditService>(PlatformAuditService);
    platformMfaTokenService = module.get<PlatformMfaTokenService>(PlatformMfaTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto = {
      email: 'admin@platform.com',
      password: 'SecurePassword123!',
      deviceId: 'laptop-1',
      deviceName: 'MacBook Pro',
    };

    it('should successfully login with valid credentials', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as PlatformUser);
      jest.spyOn(passwordHashService, 'verifyAndUpgrade').mockResolvedValue({ valid: true });
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession as PlatformSession);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession as PlatformSession);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser as PlatformUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt_token');
      jest.spyOn(auditService, 'log').mockResolvedValue({} as PlatformAuditLog);

      const result = await service.login(loginDto, '192.168.1.1', 'Mozilla/5.0');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.mfaRequired).toBe(false);
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as PlatformUser);
      jest.spyOn(passwordHashService, 'verifyAndUpgrade').mockResolvedValue({ valid: false });
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser as PlatformUser);

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });

    it('should lock account after 5 failed attempts', async () => {
      const lockedUser = { ...mockUser, failedLoginAttempts: 4 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(lockedUser as PlatformUser);
      jest.spyOn(passwordHashService, 'verifyAndUpgrade').mockResolvedValue({ valid: false });
      jest.spyOn(userRepository, 'save').mockImplementation((user) => {
        const u = user as Partial<PlatformUser>;
        expect(u.failedLoginAttempts).toBe(5);
        expect(u.lockedUntil).toBeDefined();
        return Promise.resolve(user as PlatformUser);
      });

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login from locked account', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(lockedUser as PlatformUser);

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
      expect(passwordHashService.verifyAndUpgrade).not.toHaveBeenCalled();
    });

    it('should enforce IP allowlist when configured', async () => {
      const ipRestrictedUser = {
        ...mockUser,
        ipAllowlist: ['10.0.0.0/8'],
      };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(ipRestrictedUser as PlatformUser);

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });

    it('should require MFA when enabled', async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mfaUser as PlatformUser);
      jest.spyOn(passwordHashService, 'verifyAndUpgrade').mockResolvedValue({ valid: true });
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession as PlatformSession);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession as PlatformSession);
      (platformMfaTokenService.create as jest.Mock).mockResolvedValue('temp-mfa-token');

      const result = await service.login(loginDto, '192.168.1.1', 'Mozilla/5.0');

      expect(result.mfaRequired).toBe(true);
      expect(result.accessToken).toBe('');
      expect(result.tempToken).toBe('temp-mfa-token');
      expect(result.sessionId).toBe(mockSession.id);
    });

    it('should reject suspended account', async () => {
      const suspendedUser = { ...mockUser, status: 'suspended' };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(suspendedUser as PlatformUser);

      await expect(service.login(loginDto, '192.168.1.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });

    it('should reset failed login attempts on successful login', async () => {
      const userWithFailedAttempts = { ...mockUser, failedLoginAttempts: 3 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithFailedAttempts as PlatformUser);
      jest.spyOn(passwordHashService, 'verifyAndUpgrade').mockResolvedValue({ valid: true });
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession as PlatformSession);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession as PlatformSession);
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt_token');
      jest.spyOn(auditService, 'log').mockResolvedValue({} as PlatformAuditLog);

      const saveSpy = jest.spyOn(userRepository, 'save').mockImplementation((user) => {
        const u = user as Partial<PlatformUser>;
        if (u.failedLoginAttempts === 0) {
          expect(u.failedLoginAttempts).toBe(0);
          expect(u.lockedUntil).toBeNull();
        }
        return Promise.resolve(user as PlatformUser);
      });

      await service.login(loginDto, '192.168.1.1', 'Mozilla/5.0');

      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke session on logout', async () => {
      const updateSpy = jest.spyOn(sessionRepository, 'update').mockResolvedValue({ affected: 1 } as any);

      await service.logout('session-123', 'user-123');

      expect(updateSpy).toHaveBeenCalledWith(
        { id: 'session-123', userId: 'user-123' },
        expect.objectContaining({
          isRevoked: true,
          revokedReason: 'User logout',
        }),
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all active sessions for a user', async () => {
      const updateSpy = jest.spyOn(sessionRepository, 'update').mockResolvedValue({ affected: 3 } as any);

      const result = await service.revokeAllSessions('user-123', 'admin-456', 'Security incident');

      expect(result).toBe(3);
      expect(updateSpy).toHaveBeenCalledWith(
        { userId: 'user-123', isRevoked: false },
        expect.objectContaining({
          isRevoked: true,
          revokedReason: 'Security incident',
        }),
      );
    });
  });
});
