import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

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

  async withLock<T>(
    lockKey: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
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
}
