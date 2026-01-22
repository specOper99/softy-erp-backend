import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { LessThan, Not, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let refreshTokenRepository: Repository<RefreshToken>;
  let _jwtService: JwtService;

  const mockRefreshTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'access_token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    refreshTokenRepository = module.get<Repository<RefreshToken>>(getRepositoryToken(RefreshToken));
    _jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'user',
        tenantId: 'tenant-1',
      } as unknown as User;

      const context = {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      };

      const savedToken = { id: 'rt-1' } as RefreshToken;
      mockRefreshTokenRepository.create.mockReturnValue(savedToken);
      mockRefreshTokenRepository.save.mockResolvedValue(savedToken);

      const result = await service.generateTokens(user, context);

      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: expect.any(String),
        expiresIn: 900,
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
        expect.any(Object),
      );

      expect(mockRefreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
        }),
      );
    });
  });

  describe('storeRefreshToken', () => {
    it('should store refresh token check new device callback', async () => {
      const onNewDeviceBy = jest.fn();
      const savedToken = { id: 'rt-1' } as RefreshToken;
      mockRefreshTokenRepository.create.mockReturnValue(savedToken);
      mockRefreshTokenRepository.save.mockResolvedValue(savedToken);

      await service.storeRefreshToken('user-1', 'token', { userAgent: 'ua', ipAddress: 'ip' }, false, onNewDeviceBy);

      expect(onNewDeviceBy).toHaveBeenCalledWith('user-1', 'ua', 'ip');
    });
  });

  describe('util methods', () => {
    it('should hash token', () => {
      const hash = service.hashToken('test');
      expect(hash).toBe(crypto.createHash('sha256').update('test').digest('hex'));
    });

    it('should generate refresh token', () => {
      const token = service.generateRefreshToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      mockRefreshTokenRepository.delete.mockResolvedValue({ affected: 5 });

      const count = await service.cleanupExpiredTokens();

      expect(count).toBe(5);
      expect(mockRefreshTokenRepository.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(expect.any(Date)),
      });
    });
  });

  describe('revoke functions', () => {
    it('should revoke token by hash', async () => {
      await service.revokeToken('hash', 'user-1');
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { tokenHash: 'hash', userId: 'user-1' },
        { isRevoked: true },
      );
    });

    it('should revoke all user tokens', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 2 });
      const count = await service.revokeAllUserTokens('user-1');
      expect(count).toBe(2);
    });

    it('should revoke other sessions', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 1 });
      const count = await service.revokeOtherSessions('user-1', 'current-hash');
      expect(count).toBe(1);
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: Not('current-hash') }),
        { isRevoked: true },
      );
    });

    it('should revoke session by id', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 1 });
      const count = await service.revokeSession('user-1', 'session-1');
      expect(count).toBe(1);
    });
  });

  describe('query functions', () => {
    it('getActiveSessions', async () => {
      await service.getActiveSessions('user-1');
      expect(mockRefreshTokenRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', isRevoked: false }),
        }),
      );
    });

    it('getRecentSessions', async () => {
      await service.getRecentSessions('user-1', new Date());
      expect(mockRefreshTokenRepository.find).toHaveBeenCalled();
    });

    it('getRepository', () => {
      expect(service.getRepository()).toBe(refreshTokenRepository);
    });

    it('findByTokenHash', async () => {
      await service.findByTokenHash('hash');
      expect(mockRefreshTokenRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'hash' } }),
      );
    });

    it('findPreviousLoginByUserAgent', async () => {
      await service.findPreviousLoginByUserAgent('user-1', 'ua');
      expect(mockRefreshTokenRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', userAgent: 'ua' } }),
      );
    });
  });
});
