import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import pLimit from 'p-limit';

const MAX_CACHE_CONCURRENCY = 50;

interface RedisClient {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
}

interface KeysStore {
  keys: (pattern: string) => Promise<string[]>;
}

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
    if (await this.cacheManager.get(lockKey)) return false;
    await this.cacheManager.set(lockKey, Date.now(), ttlMs);
    return true;
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.cacheManager.del(lockKey);
  }

  async withLock<T>(lockKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    if (!(await this.acquireLock(lockKey, ttlMs))) return null;
    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /** Atomic INCR with TTL (Redis) or lock-guarded fallback. */
  async increment(key: string, ttlMs: number): Promise<number> {
    const redis = (this.cacheManager as { store?: { client?: RedisClient } }).store?.client;
    if (redis?.incr) {
      const next = await redis.incr(key);
      if (next === 1) await redis.expire(key, Math.ceil(ttlMs / 1000));
      return next;
    }

    const lockKey = `${key}:incr_lock`;
    let result = 1;
    await this.withLock(lockKey, Math.min(ttlMs, 5000), async () => {
      const current = (await this.cacheManager.get<number>(key)) ?? 0;
      result = current + 1;
      await this.cacheManager.set(key, result, ttlMs);
    });
    return result;
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    const store = (this.cacheManager as { store?: Partial<KeysStore> }).store;
    if (!store?.keys) return 0;

    const keys = await store.keys(pattern);
    if (keys.length === 0) return 0;

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

  async invalidateTenantCache(tenantId: string): Promise<number> {
    return this.invalidateByPattern(`*:${tenantId}:*`);
  }
}
