import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from './cache-utils.service';

describe('CacheUtilsService', () => {
  let service: CacheUtilsService;
  let mockCacheManager: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockCacheManager = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheUtilsService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CacheUtilsService>(CacheUtilsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('set', () => {
    it('should set value in cache with TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      const ttlMs = 60000;

      await service.set(key, value, ttlMs);

      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, ttlMs);
    });

    it('should handle complex objects', async () => {
      const key = 'complex-key';
      const value = {
        users: [{ id: 1, name: 'Test' }],
        metadata: { count: 1 },
      };
      const ttlMs = 30000;

      await service.set(key, value, ttlMs);

      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, ttlMs);
    });
  });

  describe('get', () => {
    it('should return cached value', async () => {
      const key = 'test-key';
      const cachedValue = { data: 'cached' };
      mockCacheManager.get.mockResolvedValue(cachedValue);

      const result = await service.get(key);

      expect(mockCacheManager.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(cachedValue);
    });

    it('should return undefined for missing key', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);

      const result = await service.get('non-existent');

      expect(result).toBeUndefined();
    });

    it('should handle null cached value', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.get('null-value');

      expect(result).toBeNull();
    });
  });

  describe('del', () => {
    it('should delete key from cache', async () => {
      const key = 'delete-key';

      await service.del(key);

      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });

    it('should handle non-existent key deletion', async () => {
      const key = 'non-existent';

      await expect(service.del(key)).resolves.not.toThrow();
    });
  });
});
