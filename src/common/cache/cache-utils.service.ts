import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/**
 * Wrapper for CacheManager to enforce consistent TTL units (milliseconds).
 * The underlying cache-manager v5+ typically expects milliseconds, but behaviors can vary
 * by store engine. This service centralizes the logic.
 */
@Injectable()
export class CacheUtilsService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Set a value in cache with a TTL in milliseconds.
   * @param key Cache key
   * @param value Value to store
   * @param ttlMs Time to live in milliseconds
   */
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    // If specific store adapters need seconds, handle conversion here.
    // Standard Redis store used with NestJS usually takes milliseconds in v5,
    // or a config object. Assuming standard behavior for now:
    await this.cacheManager.set(key, value, ttlMs);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
