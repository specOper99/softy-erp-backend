import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordHashService } from '../../../../common/services/password-hash.service';
import { PlatformRole } from '../../enums/platform-role.enum';
import { PlatformUser } from '../../entities/platform-user.entity';
import { MFAService } from '../../services/mfa.service';
import { PlatformRefreshToken } from '../entities/platform-refresh-token.entity';
import { PlatformAuthService } from './platform-auth.service';

describe('PlatformAuthService', () => {
  let service: PlatformAuthService;
  let platformUserRepository: { findOne: jest.Mock };
  let refreshTokenRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let passwordHashService: { verify: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

  const activeUser: PlatformUser = {
    id: 'platform-user-1',
    email: 'admin@platform.test',
    fullName: 'Platform Admin',
    passwordHash: 'hash',
    role: PlatformRole.SUPER_ADMIN,
    status: 'active',
  } as PlatformUser;

  beforeEach(async () => {
    platformUserRepository = {
      findOne: jest.fn(),
    };
    refreshTokenRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((token) => Promise.resolve(token)),
      create: jest.fn().mockImplementation((token) => token),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    passwordHashService = {
      verify: jest.fn().mockResolvedValue(true),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('platform-access-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAuthService,
        { provide: getRepositoryToken(PlatformUser), useValue: platformUserRepository },
        { provide: getRepositoryToken(PlatformRefreshToken), useValue: refreshTokenRepository },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue?: number) => defaultValue),
            getOrThrow: jest.fn().mockReturnValue('platform-jwt-secret-minimum-32-chars'),
          },
        },
        { provide: PasswordHashService, useValue: passwordHashService },
        { provide: MFAService, useValue: { verifyToken: jest.fn() } },
      ],
    }).compile();

    service = module.get(PlatformAuthService);
  });

  it('login returns tokens for valid active credentials', async () => {
    platformUserRepository.findOne.mockResolvedValue(activeUser);

    const result = await service.login('admin@platform.test', 'password123');

    expect(result.accessToken).toBe('platform-access-token');
    expect(result.user.email).toBe('admin@platform.test');
    expect(refreshTokenRepository.save).toHaveBeenCalled();
  });

  it('login rejects unknown email', async () => {
    platformUserRepository.findOne.mockResolvedValue(null);

    await expect(service.login('missing@platform.test', 'password123')).rejects.toThrow(
      new UnauthorizedException('auth.invalid_credentials'),
    );
  });

  it('login rejects deactivated accounts', async () => {
    platformUserRepository.findOne.mockResolvedValue({ ...activeUser, status: 'suspended' });

    await expect(service.login('admin@platform.test', 'password123')).rejects.toThrow(
      new UnauthorizedException('auth.account_deactivated'),
    );
  });

  it('login rejects invalid password', async () => {
    platformUserRepository.findOne.mockResolvedValue(activeUser);
    passwordHashService.verify.mockResolvedValue(false);

    await expect(service.login('admin@platform.test', 'wrong-password')).rejects.toThrow(
      new UnauthorizedException('auth.invalid_credentials'),
    );
  });

  it('refreshTokens rotates valid refresh tokens', async () => {
    const storedToken = {
      tokenHash: 'hash',
      userId: activeUser.id,
      isValid: () => true,
      isRevoked: false,
    };
    refreshTokenRepository.findOne.mockResolvedValue(storedToken);
    platformUserRepository.findOne.mockResolvedValue(activeUser);

    const result = await service.refreshTokens('raw-refresh-token');

    expect(result.accessToken).toBe('platform-access-token');
    expect(storedToken.isRevoked).toBe(true);
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(storedToken);
  });

  it('refreshTokens rejects invalid refresh tokens', async () => {
    refreshTokenRepository.findOne.mockResolvedValue(null);

    await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
      new UnauthorizedException('auth.invalid_refresh_token'),
    );
  });

  it('getSession returns null for inactive users', async () => {
    platformUserRepository.findOne.mockResolvedValue({ ...activeUser, status: 'locked' });

    await expect(service.getSession(activeUser.id)).resolves.toBeNull();
  });

  it('logout revokes refresh token for the current user', async () => {
    await service.logout('refresh-token', activeUser.id);

    expect(refreshTokenRepository.update).toHaveBeenCalledWith(expect.objectContaining({ userId: activeUser.id }), {
      isRevoked: true,
    });
  });
});
