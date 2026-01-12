import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'auth.jwtSecret') return 'test-jwt-secret';
              return undefined;
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
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

    strategy = module.get<JwtStrategy>(JwtStrategy);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should call authService.validateUser with payload', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'USER',
      };
      const expectedUser = { id: 'user-123', email: 'test@example.com' };
      authService.validateUser.mockResolvedValue(expectedUser as any);

      const mockReq = {
        headers: { authorization: 'Bearer test-token' },
      } as any;
      const result = await strategy.validate(mockReq, payload);

      expect(authService.validateUser).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expectedUser);
    });

    it('should return null for invalid user', async () => {
      const payload = {
        sub: 'invalid-user',
        email: 'invalid@example.com',
        tenantId: 'tenant-123',
        role: 'USER',
      };
      authService.validateUser.mockResolvedValue(null as any);

      const mockReq = {
        headers: { authorization: 'Bearer test-token' },
      } as any;
      const result = await strategy.validate(mockReq, payload);

      expect(result).toBeNull();
    });
  });

  describe('constructor', () => {
    it('should throw error when JWT_SECRET is not defined', () => {
      expect(() => {
        new JwtStrategy(
          {
            get: () => undefined,
          } as any,
          {} as any,
          {} as any,
        );
      }).toThrow('JWT_SECRET is not defined');
    });
  });
});
