import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { Cache } from 'cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

describe('Redis Cache Integration Tests', () => {
  let module: TestingModule;
  let cacheManager: Cache;
  let redisContainer: StartedTestContainer;
  let redisUrl: string;

  beforeAll(async () => {
    // Start Redis container
    console.log('🐳 Starting Redis container...');
    redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    const host = redisContainer.getHost();
    const port = redisContainer.getMappedPort(6379);
    redisUrl = `redis://${host}:${port}`;

    console.log(`✅ Redis container started at ${redisUrl}`);

    // Create test module with Redis cache
    module = await Test.createTestingModule({
      imports: [
        CacheModule.registerAsync({
          useFactory: async () => ({
            store: await redisStore({
              url: redisUrl,
            }),
            ttl: 60000, // 60 seconds default
          }),
        }),
      ],
    }).compile();

    cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  afterAll(async () => {
    await module?.close();
    if (redisContainer) {
      await redisContainer.stop();
      console.log('✅ Redis container stopped');
    }
  });

  beforeEach(async () => {
    // Clear cache before each test
    const cm = cacheManager as any;
    if (typeof cm.reset === 'function') {
      await cm.reset();
    } else if (cm.store && typeof cm.store.reset === 'function') {
      await cm.store.reset();
    } else if (cm.store && typeof cm.store.keys === 'function' && typeof cm.store.del === 'function') {
      const keys = await cm.store.keys('*');
      if (keys && keys.length > 0) {
        await cm.store.del(keys);
      }
    }
  });

  describe('Basic Cache Operations', () => {
    it('should set and get values from Redis', async () => {
      const key = 'test:key:1';
      const value = { data: 'test value', count: 42 };

      // Set value
      await cacheManager.set(key, value);

      // Get value
      const retrieved = await cacheManager.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should handle cache expiration (TTL)', async () => {
      const key = 'test:expiring:key';
      const value = 'expires soon';

      // Set with 1 second TTL
      await cacheManager.set(key, value, 1000);

      // Should exist immediately
      let cached = await cacheManager.get(key);
      expect(cached).toBe(value);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should be expired
      cached = await cacheManager.get(key);
      expect(cached).toBeUndefined();
    });

    it('should delete specific keys', async () => {
      const key = 'test:delete:key';
      await cacheManager.set(key, 'to be deleted');

      // Verify it exists
      let value = await cacheManager.get(key);
      expect(value).toBe('to be deleted');

      // Delete
      await cacheManager.del(key);

      // Verify it's gone
      value = await cacheManager.get(key);
      expect(value).toBeUndefined();
    });

    it('should reset/clear all cache', async () => {
      // Set multiple keys
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');

      // Verify they exist
      expect(await cacheManager.get('key1')).toBe('value1');
      expect(await cacheManager.get('key2')).toBe('value2');

      // Reset all
      // Reset all
      const cm = cacheManager as any;
      try {
        if (cm.store && cm.store.client) {
          if (typeof cm.store.client.flushDb === 'function') {
            await cm.store.client.flushDb();
          } else if (typeof cm.store.client.flushdb === 'function') {
            await cm.store.client.flushdb();
          } else if (typeof cm.store.client.flushAll === 'function') {
            await cm.store.client.flushAll();
          }
        } else if (typeof cm.reset === 'function') {
          await cm.reset();
        } else if (cm.store && typeof cm.store.reset === 'function') {
          await cm.store.reset();
        }
      } catch (e) {
        console.error('Failed to flush redis', e);
      }

      // Verify all are gone
      expect(await cacheManager.get('key1')).toBeUndefined();
      expect(await cacheManager.get('key2')).toBeUndefined();
      expect(await cacheManager.get('key3')).toBeUndefined();
    });
  });

  describe('Complex Data Types', () => {
    it('should cache complex objects', async () => {
      const key = 'user:profile:123';
      const userData = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        metadata: {
          lastLogin: new Date().toISOString(),
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        roles: ['admin', 'user'],
      };

      await cacheManager.set(key, userData);
      const retrieved = await cacheManager.get(key);

      expect(retrieved).toEqual(userData);
    });

    it('should cache arrays', async () => {
      const key = 'bookings:list:tenant1';
      const bookings = [
        { id: '1', client: 'Client A', amount: 1000 },
        { id: '2', client: 'Client B', amount: 2000 },
        { id: '3', client: 'Client C', amount: 3000 },
      ];

      await cacheManager.set(key, bookings);
      const retrieved = await cacheManager.get(key);

      expect(retrieved).toEqual(bookings);
      expect(Array.isArray(retrieved)).toBe(true);
    });
  });

  describe('Multi-Tenant Cache Isolation', () => {
    it('should isolate cache keys by tenant', async () => {
      const tenant1Key = 'tenant:abc123:data';
      const tenant2Key = 'tenant:xyz789:data';

      await cacheManager.set(tenant1Key, { tenant: 'abc123', data: 'secret1' });
      await cacheManager.set(tenant2Key, { tenant: 'xyz789', data: 'secret2' });

      const tenant1Data = await cacheManager.get(tenant1Key);
      const tenant2Data = await cacheManager.get(tenant2Key);

      expect(tenant1Data).toEqual({ tenant: 'abc123', data: 'secret1' });
      expect(tenant2Data).toEqual({ tenant: 'xyz789', data: 'secret2' });
    });

    it('should allow selective cache invalidation by tenant', async () => {
      await cacheManager.set('tenant:abc123:key1', 'value1');
      await cacheManager.set('tenant:abc123:key2', 'value2');
      await cacheManager.set('tenant:xyz789:key1', 'other1');

      // Invalidate only tenant abc123 keys
      await cacheManager.del('tenant:abc123:key1');
      await cacheManager.del('tenant:abc123:key2');

      // Verify abc123 keys are gone
      expect(await cacheManager.get('tenant:abc123:key1')).toBeUndefined();
      expect(await cacheManager.get('tenant:abc123:key2')).toBeUndefined();

      // Verify xyz789 keys remain
      expect(await cacheManager.get('tenant:xyz789:key1')).toBe('other1');
    });
  });

  describe('Cache Performance', () => {
    it('should handle concurrent reads/writes', async () => {
      const operations = [];

      // Perform 100 concurrent writes
      for (let i = 0; i < 100; i++) {
        operations.push(cacheManager.set(`concurrent:${i}`, { index: i }));
      }

      await Promise.all(operations);

      // Verify all writes succeeded
      const reads = [];
      for (let i = 0; i < 100; i++) {
        reads.push(cacheManager.get(`concurrent:${i}`));
      }

      const results = await Promise.all(reads);
      const allSucceeded = results.every((result, index) => result && (result as any).index === index);

      expect(allSucceeded).toBe(true);
    });
  });
});
