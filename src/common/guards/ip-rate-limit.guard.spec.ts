import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { IpRateLimitGuard } from './ip-rate-limit.guard';

describe('IpRateLimitGuard', () => {
  let guard: IpRateLimitGuard;

  const mockConfigService = {
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
        default:
          return null;
      }
    }) as unknown as jest.Mock<any, any>,
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
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
    mockCacheService.get.mockClear();
    mockCacheService.set.mockClear();
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

    mockCacheService.get.mockResolvedValue({
      count: 101,
      firstRequest: Date.now(),
      blocked: false,
    });

    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('should allow request if within limits', async () => {
    mockCacheService.get.mockResolvedValue(null);
    const context = createMockContext('127.0.0.1');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockCacheService.set).toHaveBeenCalled();
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

    expect(mockCacheService.get).toHaveBeenCalledWith('ip_rate:203.0.113.5');
  });

  it('should block request if hard limit exceeded', async () => {
    mockCacheService.get.mockResolvedValue({
      count: 101,
      firstRequest: Date.now(),
      blocked: false,
    });
    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockCacheService.set).toHaveBeenCalledWith(
      expect.stringContaining('127.0.0.1'),
      expect.objectContaining({ blocked: true }),
      expect.any(Number),
    );
  });

  it('should return 429 when soft limit exceeded (no server-side sleep)', async () => {
    mockCacheService.get.mockResolvedValue({
      count: 50,
      firstRequest: Date.now(),
      blocked: false,
    });
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
      mockCacheService.get.mockResolvedValue(null);
      const context = createMockContextWithUser('user-123');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.get).toHaveBeenCalledWith('ip_rate:user:user-123');
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'ip_rate:user:user-123',
        expect.objectContaining({ count: 1 }),
        expect.any(Number),
      );
    });

    it('should generate session ID for anonymous users when IP is missing', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const context = createMockContextWithUser(undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      // Should use session-based key
      expect(mockCacheService.get).toHaveBeenCalled();
      const callArgs = mockCacheService.get.mock.calls[0] as [string];
      expect(callArgs[0]).toMatch(/^ip_rate:session:[a-f0-9]{32}$/);
    });

    it('should reuse existing session ID cookie for anonymous users', async () => {
      const existingSessionId = 'a'.repeat(32); // 32 char hex string
      mockCacheService.get.mockResolvedValue(null);
      const context = createMockContextWithUser(undefined, { rate_limit_session: existingSessionId });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.get).toHaveBeenCalledWith(`ip_rate:session:${existingSessionId}`);
    });

    it('should not allow one authenticated user to block another when IP is missing', async () => {
      mockCacheService.get.mockResolvedValue({
        count: 101,
        firstRequest: Date.now(),
        blocked: false,
      });

      // First user exceeds limit
      const context1 = createMockContextWithUser('user-1');
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      // Second user should have separate counter
      mockCacheService.get.mockResolvedValue(null);
      const context2 = createMockContextWithUser('user-2');
      const result = await guard.canActivate(context2);

      expect(result).toBe(true);
      expect(mockCacheService.get).toHaveBeenCalledWith('ip_rate:user:user-2');
    });

    it('should not allow one anonymous session to block another when IP is missing', async () => {
      const session1 = 'a'.repeat(32);
      const session2 = 'b'.repeat(32);

      // First session exceeds limit
      mockCacheService.get.mockResolvedValue({
        count: 101,
        firstRequest: Date.now(),
        blocked: false,
      });
      const context1 = createMockContextWithUser(undefined, { rate_limit_session: session1 });
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      // Second session should have separate counter
      mockCacheService.get.mockResolvedValue(null);
      const context2 = createMockContextWithUser(undefined, { rate_limit_session: session2 });
      const result = await guard.canActivate(context2);

      expect(result).toBe(true);
      expect(mockCacheService.get).toHaveBeenCalledWith(`ip_rate:session:${session2}`);
    });

    it('should still use IP-based rate limiting when IP is available', async () => {
      mockCacheService.get.mockResolvedValue(null);
      const context = createMockContext('192.168.1.100');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockCacheService.get).toHaveBeenCalledWith('ip_rate:192.168.1.100');
    });
  });
});
