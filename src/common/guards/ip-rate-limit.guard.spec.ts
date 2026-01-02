import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
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
    }),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<IpRateLimitGuard>(IpRateLimitGuard);
    mockCacheManager.get.mockClear();
    mockCacheManager.set.mockClear();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockContext = (ip: string) => {
    const setHeader = jest.fn();
    return {
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

  it('should allow request if within limits', async () => {
    mockCacheManager.get.mockResolvedValue(null);
    const context = createMockContext('127.0.0.1');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockCacheManager.set).toHaveBeenCalled();
  });

  it('should block request if hard limit exceeded', async () => {
    mockCacheManager.get.mockResolvedValue({
      count: 101,
      firstRequest: Date.now(),
      blocked: false,
    });
    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('127.0.0.1'),
      expect.objectContaining({ blocked: true }),
      expect.any(Number),
    );
  });

  it('should return 429 when soft limit exceeded (no server-side sleep)', async () => {
    mockCacheManager.get.mockResolvedValue({
      count: 50,
      firstRequest: Date.now(),
      blocked: false,
    });
    const context = createMockContext('127.0.0.1');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });
});
