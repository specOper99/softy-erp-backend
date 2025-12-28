import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountLockoutService } from './account-lockout.service';

describe('AccountLockoutService', () => {
  let service: AccountLockoutService;

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => defaultValue),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountLockoutService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AccountLockoutService>(AccountLockoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isLockedOut', () => {
    it('should return false if no info in cache', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      const result = await service.isLockedOut('test@test.com');
      expect(result.locked).toBe(false);
    });

    it('should return true if lockedUntil is in future', async () => {
      const future = Date.now() + 10000;
      mockCacheManager.get.mockResolvedValue({
        attempts: 5,
        lockedUntil: future,
      });
      const result = await service.isLockedOut('test@test.com');
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    it('should return false and clear cache if lockout expired', async () => {
      const past = Date.now() - 10000;
      mockCacheManager.get.mockResolvedValue({
        attempts: 5,
        lockedUntil: past,
      });
      const result = await service.isLockedOut('test@test.com');
      expect(result.locked).toBe(false);
      expect(mockCacheManager.del).toHaveBeenCalled();
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempts', async () => {
      mockCacheManager.get.mockResolvedValue({ attempts: 1 });
      await service.recordFailedAttempt('test@test.com');
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ attempts: 2 }),
        expect.any(Number),
      );
    });

    it('should lock account when max attempts reached', async () => {
      mockCacheManager.get.mockResolvedValue({ attempts: 4 }); // max is 5
      const isLocked = await service.recordFailedAttempt('test@test.com');
      expect(isLocked).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ lockedUntil: expect.any(Number) }),
        expect.any(Number),
      );
    });
  });

  describe('clearAttempts', () => {
    it('should delete keys from cache', async () => {
      await service.clearAttempts('test@test.com');
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'lockout:test@test.com',
      );
    });
  });
});
