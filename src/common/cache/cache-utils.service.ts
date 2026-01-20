import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { batchDelete } from '../utils/async.utils';

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
    if (keys.length > 0) {
      // Use bounded concurrency to prevent resource exhaustion
      // when invalidating large key sets (DoS prevention)
      const deleted = await batchDelete((key) => this.cacheManager.del(key), keys, MAX_CACHE_CONCURRENCY);
      return deleted;
    }
    return 0;
  }

  /**
   * Invalidate all cache entries for a specific tenant.
   * Uses pattern matching to find tenant-scoped keys.
   */
  async invalidateTenantCache(tenantId: string): Promise<number> {
    return this.invalidateByPattern(`*:${tenantId}:*`);
  }
}
