import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import pLimit from 'p-limit';

/**
 * Maximum concurrent cache operations to prevent resource exhaustion.
 * This prevents DoS conditions when invalidating large key sets.
 */
const MAX_CACHE_CONCURRENCY = 50;

@Injectable()
export class CacheUtilsService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.cacheManager.set(key, value, ttlMs);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async acquireLock(lockKey: string, ttlMs: number): Promise<boolean> {
    const existing = await this.cacheManager.get(lockKey);
    if (existing) {
      return false;
    }
    await this.cacheManager.set(lockKey, Date.now(), ttlMs);
    return true;
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.cacheManager.del(lockKey);
  }

  async withLock<T>(lockKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, ttlMs);
    if (!acquired) {
      return null;
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Atomically increment a counter key and set its TTL (on first creation).
   * Uses Redis INCR when available for true atomicity; falls back to a
   * lock-guarded get/set on other stores.
   */
  async increment(key: string, ttlMs: number): Promise<number> {
    // Attempt to use Redis native INCR for true atomicity.
    interface RedisClient {
      incr: (key: string) => Promise<number>;
      expire: (key: string, seconds: number) => Promise<number>;
    }
    interface RedisStore {
      client?: RedisClient;
    }
    const store = (this.cacheManager as { store?: RedisStore }).store;
    if (store?.client?.incr) {
      const next = await store.client.incr(key);
      if (next === 1) {
        // Key just created — set the expiry once.
        await store.client.expire(key, Math.ceil(ttlMs / 1000));
      }
      return next;
    }

    // Fallback: serialise with a short-lived lock.
    const lockKey = `${key}:incr_lock`;
    let result = 1;
    await this.withLock(lockKey, Math.min(ttlMs, 5000), async () => {
      const current = (await this.cacheManager.get<number>(key)) ?? 0;
      result = current + 1;
      await this.cacheManager.set(key, result, ttlMs);
    });
    return result;
  }

  /**
   * Delete all cache keys matching a pattern.
   * Note: Pattern matching requires Redis store with keys() support.
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    // Type definition for stores that support keys() method (e.g., Redis)
    interface KeysStore {
      keys: (pattern: string) => Promise<string[]>;
    }

    const cacheWithStore = this.cacheManager as { store?: Partial<KeysStore> };
    const store = cacheWithStore.store;

    if (!store || typeof store.keys !== 'function') {
      // Memory store doesn't support pattern matching
      return 0;
    }

    const keys: string[] = await store.keys(pattern);
    if (keys.length === 0) return 0;

    // Bounded concurrency prevents resource exhaustion (DoS) on large key sets.
    // Errors swallowed: best-effort invalidation, return successful count.
    const limit = pLimit(MAX_CACHE_CONCURRENCY);
    const results = await Promise.all(
      keys.map((key) =>
        limit(() =>
          this.cacheManager
            .del(key)
            .then(() => true)
            .catch(() => false),
        ),
      ),
    );
    return results.filter(Boolean).length;
  }

  /**
   * Invalidate all cache entries for a specific tenant.
   * Uses pattern matching to find tenant-scoped keys.
   */
  async invalidateTenantCache(tenantId: string): Promise<number> {
    return this.invalidateByPattern(`*:${tenantId}:*`);
  }
}
