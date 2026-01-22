import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DistributedLockService } from './distributed-lock.service';

// Mock ioredis module
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  }));
});

describe('DistributedLockService', () => {
  let service: DistributedLockService;
  let mockRedis: {
    set: jest.Mock;
    eval: jest.Mock;
    exists: jest.Mock;
    quit: jest.Mock;
    on: jest.Mock;
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    // Reset the mock
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
      exists: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    Redis.mockImplementation(() => mockRedis);

    const module: TestingModule = await Test.createTestingModule({
      providers: [DistributedLockService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<DistributedLockService>(DistributedLockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('acquire', () => {
    it('should acquire lock successfully and return token', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquire('test-resource');

      expect(result.acquired).toBe(true);
      expect(result.lockToken).toBeDefined();
      expect(result.lockToken.length).toBe(32); // 16 bytes hex = 32 chars
      expect(mockRedis.set).toHaveBeenCalledWith('lock:test-resource', expect.any(String), 'PX', 30000, 'NX');
    });

    it('should return acquired=false when lock already held', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquire('test-resource');

      expect(result.acquired).toBe(false);
      expect(result.lockToken).toBeDefined(); // Token is still generated
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.acquire('test-resource', { ttl: 60000 });

      expect(mockRedis.set).toHaveBeenCalledWith('lock:test-resource', expect.any(String), 'PX', 60000, 'NX');
    });
  });

  describe('release', () => {
    it('should release lock when token matches', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.release('test-resource', 'valid-token');

      expect(result).toBe(true);
    });

    it('should not release lock when token does not match', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.release('test-resource', 'invalid-token');

      expect(result).toBe(false);
    });
  });

  describe('extend', () => {
    it('should extend lock ttl when token matches', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.extend('test-resource', 'valid-token', 60000);

      expect(result).toBe(true);
    });

    it('should not extend when token does not match', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.extend('test-resource', 'invalid-token', 60000);

      expect(result).toBe(false);
    });
  });

  describe('acquireWithRetry', () => {
    it('should acquire lock on first attempt', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquireWithRetry('test-resource');

      expect(result).not.toBeNull();
      expect(result?.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('should retry and acquire on subsequent attempt', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null) // First attempt fails
        .mockResolvedValueOnce('OK'); // Second attempt succeeds

      const result = await service.acquireWithRetry('test-resource', {
        maxRetries: 3,
        retryDelay: 10, // Short delay for faster tests
      });

      expect(result).not.toBeNull();
      expect(result?.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should return null after all retries exhausted', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireWithRetry('test-resource', {
        maxRetries: 2,
        retryDelay: 10,
      });

      expect(result).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('withLock', () => {
    it('should execute callback when lock acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const callback = jest.fn().mockResolvedValue('result');

      const result = await service.withLock('test-resource', callback);

      expect(result).toBe('result');
      expect(callback).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock was released
    });

    it('should return null when lock cannot be acquired', async () => {
      mockRedis.set.mockResolvedValue(null);

      const callback = jest.fn();

      const result = await service.withLock('test-resource', callback, {
        maxRetries: 1,
        retryDelay: 10,
      });

      expect(result).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should release lock even if callback throws', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const callback = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(service.withLock('test-resource', callback)).rejects.toThrow('Test error');

      expect(mockRedis.eval).toHaveBeenCalled(); // Lock was still released
    });
  });

  describe('isLocked', () => {
    it('should return true when resource is locked', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isLocked('test-resource');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('lock:test-resource');
    });

    it('should return false when resource is not locked', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isLocked('test-resource');

      expect(result).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close redis connection', async () => {
      await service.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
