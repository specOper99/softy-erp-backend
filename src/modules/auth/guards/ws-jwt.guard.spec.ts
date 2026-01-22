import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { WsJwtGuard } from './ws-jwt.guard';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: jest.Mocked<JwtService>;
  let tokenBlacklistService: jest.Mocked<TokenBlacklistService>;
  // let configService: jest.Mocked<ConfigService>;

  const createMockContext = (client: unknown) =>
    ({
      switchToWs: () => ({
        getClient: () => client,
      }),
    }) as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsJwtGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ALLOWED_ALGORITHMS') return 'HS256';
              if (key === 'JWT_PUBLIC_KEY') return undefined;
              if (key === 'auth.jwtSecret') return 'test-secret';
              return undefined;
            }),
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            isBlacklisted: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    guard = module.get<WsJwtGuard>(WsJwtGuard);
    jwtService = module.get(JwtService);
    tokenBlacklistService = module.get(TokenBlacklistService);
    // configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should authenticate with token in query params', async () => {
      const client = {
        handshake: {
          query: { token: 'valid.token' },
          headers: {},
        },
        data: {} as Record<string, any>,
      };
      const context = createMockContext(client);
      const payload = { sub: 'user-123', email: 'test@example.com' };

      tokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      jwtService.verifyAsync.mockResolvedValue(payload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(client.data['user']).toEqual(payload);
      expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledWith('valid.token');
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        'valid.token',
        expect.objectContaining({
          secret: 'test-secret',
          algorithms: ['HS256'],
        }),
      );
    });

    it('should authenticate with Bearer token in headers', async () => {
      const client = {
        handshake: {
          query: {},
          headers: { authorization: 'Bearer valid.token' },
        },
        data: {} as Record<string, any>,
      };
      const context = createMockContext(client);
      const payload = { sub: 'user-123', email: 'test@example.com' };

      tokenBlacklistService.isBlacklisted.mockResolvedValue(false);
      jwtService.verifyAsync.mockResolvedValue(payload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(client.data['user']).toEqual(payload);
    });

    it('should throw WsException when no token provided', async () => {
      const client = {
        handshake: {
          query: {},
          headers: {},
        },
        data: {},
      };
      const context = createMockContext(client);

      await expect(guard.canActivate(context)).rejects.toThrow(WsException);
      await expect(guard.canActivate(context)).rejects.toThrow('Unauthorized');
    });

    it('should throw WsException when token verification fails', async () => {
      const client = {
        handshake: {
          query: { token: 'invalid.token' },
          headers: {},
        },
        data: {},
      };
      const context = createMockContext(client);

      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    });

    it('should throw WsException when token is blacklisted', async () => {
      const client = {
        handshake: {
          query: { token: 'revoked.token' },
          headers: {},
        },
        data: {},
      };
      const context = createMockContext(client);

      tokenBlacklistService.isBlacklisted.mockResolvedValue(true);

      await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    });

    it('should throw WsException when Authorization header format is invalid', async () => {
      const client = {
        handshake: {
          query: {},
          headers: { authorization: 'Basic token' },
        },
        data: {},
      };
      const context = createMockContext(client);

      await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    });
  });
});
