import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { IpRateLimitGuard } from './ip-rate-limit.guard';

describe('IpRateLimitGuard', () => {
  let guard: IpRateLimitGuard;

  const defaultConfigGet = (key: string) => {
    switch (key) {
      case 'RATE_LIMIT_SOFT':
        return 50;
      case 'RATE_LIMIT_HARD':
        return 100;
      case 'RATE_LIMIT_WINDOW_SECONDS':
        return 60;
      case 'RATE_LIMIT_BLOCK_SECONDS':
        return 900;
      case 'RATE_LIMIT_DELAY_MS':
        return 500;
      default:
        return null;
    }
  };

  const mockConfigService = {
    get: jest.fn(defaultConfigGet) as unknown as jest.Mock<any, any>,
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        { provide: CacheUtilsService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
        Reflector,
      ],
    }).compile();

    guard = module.get<IpRateLimitGuard>(IpRateLimitGuard);
    mockCacheService.get.mockReset();
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockReset();
    mockCacheService.set.mockResolvedValue(undefined);
    mockCacheService.increment.mockReset();
    mockCacheService.increment.mockResolvedValue(1);
    mockConfigService.get.mockImplementation(defaultConfigGet);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockContext = (ip: string) => {
    const setHeader = jest.fn();
    return {
      getHandler: () => createMockContext,
      getClass: () => IpRateLimitGuard,
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          headers: {},
          socket: { remoteAddress: ip },
        }),
        getResponse: () => ({
          setHeader,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const createMockContextWithHeaders = (remoteAddress: string, headers: Record<string, string>, ip?: string) => {
    const setHeader = jest.fn();
    return {
      getHandler: () => createMockContextWithHeaders,
      getClass: () => IpRateLimitGuard,
      switchToHttp: () => ({
        getRequest: () => ({
          ip: ip ?? remoteAddress,
          headers,
          socket: { remoteAddress },
        }),
        getResponse: () => ({
          setHeader,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow bypass when disabled in non-production', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'RATE_LIMIT_ENABLED') return 'false';
      if (key === 'NODE_ENV') return 'development';
      return null;
    });
    const context = createMockContext('127.0.0.1');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should enforce limits when disabled in production (safety fallback)', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'RATE_LIMIT_ENABLED') return 'false';
      if (key === 'NODE_ENV') return 'production';
      return 100;
    });

    // Even with RATE_LIMIT_ENABLED=false, production enforces limits via increment path.
    mockCacheService.increment.mockResolvedValue(101);

    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('should allow request if within limits', async () => {
    // increment returns 1 (well within soft/hard limits)
    mockCacheService.increment.mockResolvedValue(1);
    const context = createMockContext('127.0.0.1');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockCacheService.increment).toHaveBeenCalledWith(expect.stringContaining('127.0.0.1'), expect.any(Number));
  });

  it('should use X-Forwarded-For when TRUST_PROXY is enabled (uses last entry)', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        { provide: CacheUtilsService, useValue: mockCacheService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'RATE_LIMIT_SOFT':
                  return 50;
                case 'RATE_LIMIT_HARD':
                  return 100;
                case 'RATE_LIMIT_WINDOW_SECONDS':
                  return 60;
                case 'RATE_LIMIT_BLOCK_SECONDS':
                  return 900;
                case 'RATE_LIMIT_DELAY_MS':
                  return 500;
                case 'TRUST_PROXY':
                  return 'true';
                default:
                  return null;
              }
            }),
          },
        },
        Reflector,
      ],
    }).compile();

    const trustedGuard = module.get<IpRateLimitGuard>(IpRateLimitGuard);
    mockCacheService.get.mockResolvedValue(null);

    const context = createMockContextWithHeaders('10.0.0.2', {
      'x-forwarded-for': '8.8.8.8, 203.0.113.5',
    });

    await trustedGuard.canActivate(context);

    expect(mockCacheService.increment).toHaveBeenCalledWith('ip_rate:203.0.113.5', expect.any(Number));
  });

  it('should block request if hard limit exceeded', async () => {
    mockCacheService.increment.mockResolvedValue(101);
    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockCacheService.set).toHaveBeenCalledWith(
      expect.stringContaining('127.0.0.1'),
      expect.objectContaining({ blocked: true }),
      expect.any(Number),
    );
  });

  it('should return 429 when soft limit exceeded (no server-side sleep)', async () => {
    mockCacheService.increment.mockResolvedValue(51);
    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  describe('Fallback strategy for missing IP', () => {
    const createMockContextWithUser = (userId?: string, cookies?: Record<string, string>) => {
      const mockSetHeader = jest.fn();
      const mockCookie = jest.fn();
      return {
        getHandler: () => createMockContextWithUser,
        getClass: () => IpRateLimitGuard,
        switchToHttp: () => ({
          getRequest: () => ({
            ip: null,
            headers: {},
            socket: { remoteAddress: null },
            user: userId ? { id: userId } : undefined,
            cookies: cookies || {},
          }),
          getResponse: () => ({
            setHeader: mockSetHeader,
            cookie: mockCookie,
          }),
        }),
      } as unknown as ExecutionContext;
    };

    it('should use user ID for authenticated users when IP is missing', async () => {
      const context = createMockContextWithUser('user-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.increment).toHaveBeenCalledWith('ip_rate:user:user-123', expect.any(Number));
    });

    it('should reject anonymous users with no IP (session cookie bucket removed)', async () => {
      const context = createMockContextWithUser(undefined);

      // Anonymous users with no IP are always rejected — session cookie keys were
      // removed (Step 5) because attackers can trivially rotate self-issued cookies.
      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(mockCacheService.increment).not.toHaveBeenCalled();
    });

    it('should reject even if session cookie present (session bucket no longer honoured)', async () => {
      const existingSessionId = 'a'.repeat(32);
      const context = createMockContextWithUser(undefined, { rate_limit_session: existingSessionId });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(mockCacheService.increment).not.toHaveBeenCalled();
    });

    it('should not allow one authenticated user to block another when IP is missing', async () => {
      mockCacheService.increment.mockResolvedValueOnce(101);

      // First user exceeds limit
      const context1 = createMockContextWithUser('user-1');
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      // Second user should have separate counter (increment returns 1 by default)
      const context2 = createMockContextWithUser('user-2');
      const result = await guard.canActivate(context2);

      expect(result).toBe(true);
      expect(mockCacheService.increment).toHaveBeenCalledWith('ip_rate:user:user-2', expect.any(Number));
    });

    it('should reject all anonymous no-IP requests independently', async () => {
      const session1 = 'a'.repeat(32);
      const session2 = 'b'.repeat(32);

      // Both sessions are rejected — no session-cookie bucket support
      const context1 = createMockContextWithUser(undefined, { rate_limit_session: session1 });
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      const context2 = createMockContextWithUser(undefined, { rate_limit_session: session2 });
      await expect(guard.canActivate(context2)).rejects.toThrow(HttpException);

      expect(mockCacheService.increment).not.toHaveBeenCalled();
    });

    it('should still use IP-based rate limiting when IP is available', async () => {
      const context = createMockContext('192.168.1.100');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.increment).toHaveBeenCalledWith('ip_rate:192.168.1.100', expect.any(Number));
    });
  });
});
