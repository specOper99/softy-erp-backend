/**
 * DistributedLockService - Redis-based distributed locking
 *
 * This service replaces PostgreSQL advisory locks with Redis-based distributed locks,
 * which scale across multiple database instances and provide safer concurrency control.
 *
 * Key features:
 * - Redis SET NX with TTL for atomic lock acquisition
 * - Token-based release prevents accidental unlock by wrong holder
 * - Lua scripts for atomic operations
 * - Automatic retry with exponential backoff
 * - Works across multiple server instances and database replicas
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes, randomInt } from 'node:crypto';

export interface LockResult {
  acquired: boolean;
  lockToken: string;
}

export interface LockOptions {
  /** Lock TTL in milliseconds (default: 30000ms = 30s) */
  ttl?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in milliseconds (default: 100ms) */
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttl: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 100, // 100ms base delay
};

@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly redis: Redis;

  /**
   * Lua script for atomic release with token validation.
   * Only releases the lock if the token matches, preventing
   * accidental release by a different process.
   */
  private readonly RELEASE_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  /**
   * Lua script for extending lock TTL.
   * Only extends if the token matches, preventing
   * extension by a different process.
   */
  private readonly EXTEND_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: true,
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected for distributed locking');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Acquire a distributed lock for a resource.
   *
   * Uses Redis SET NX with TTL for atomic lock acquisition.
   * Returns a token that must be used to release the lock.
   *
   * @param resource - Unique identifier for the resource to lock
   * @param options - Lock options (ttl, maxRetries, retryDelay)
   * @returns LockResult with acquired flag and lock token
   */
  async acquire(resource: string, options: LockOptions = {}): Promise<LockResult> {
    const { ttl } = { ...DEFAULT_OPTIONS, ...options };
    const lockKey = `lock:${resource}`;
    const lockToken = randomBytes(16).toString('hex');

    // SET NX EX - atomic operation
    const result = await this.redis.set(
      lockKey,
      lockToken,
      'PX', // milliseconds
      ttl,
      'NX', // only if not exists
    );

    const acquired = result === 'OK';

    if (acquired) {
      this.logger.debug(`Lock acquired for ${resource} (token: ${lockToken.slice(0, 8)}...)`);
    }

    return { acquired, lockToken };
  }

  /**
   * Release a distributed lock.
   *
   * Uses Lua script for atomic check-and-delete to ensure
   * only the lock holder can release the lock.
   *
   * @param resource - Unique identifier for the resource
   * @param lockToken - Token returned from acquire()
   * @returns True if lock was released, false if not held or expired
   */
  async release(resource: string, lockToken: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    const result = await this.redis.eval(this.RELEASE_SCRIPT, 1, lockKey, lockToken);
    const released = result === 1;

    if (released) {
      this.logger.debug(`Lock released for ${resource}`);
    } else {
      this.logger.warn(`Failed to release lock for ${resource} - wrong token or expired`);
    }

    return released;
  }

  /**
   * Extend the TTL of an existing lock.
   *
   * Useful for long-running operations that need more time.
   *
   * @param resource - Unique identifier for the resource
   * @param lockToken - Token returned from acquire()
   * @param ttl - New TTL in milliseconds
   * @returns True if extended, false if not held or expired
   */
  async extend(resource: string, lockToken: string, ttl: number): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    const result = await this.redis.eval(this.EXTEND_SCRIPT, 1, lockKey, lockToken, ttl.toString());
    const extended = result === 1;

    if (extended) {
      this.logger.debug(`Lock extended for ${resource} by ${ttl}ms`);
    } else {
      this.logger.warn(`Failed to extend lock for ${resource} - wrong token or expired`);
    }

    return extended;
  }

  /**
   * Acquire a lock with automatic retry using exponential backoff.
   *
   * @param resource - Unique identifier for the resource to lock
   * @param options - Lock options
   * @returns LockResult or null if all retries failed
   */
  async acquireWithRetry(resource: string, options: LockOptions = {}): Promise<LockResult | null> {
    const { maxRetries, retryDelay, ttl } = { ...DEFAULT_OPTIONS, ...options };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.acquire(resource, { ttl });

      if (result.acquired) {
        return result;
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = retryDelay * Math.pow(2, attempt - 1) + randomInt(0, 50);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.logger.warn(`Failed to acquire lock for ${resource} after ${maxRetries} attempts`);
    return null;
  }

  /**
   * Execute a function within a distributed lock.
   *
   * Automatically acquires the lock before execution and releases
   * it after completion (even on error).
   *
   * @param resource - Unique identifier for the resource to lock
   * @param fn - Async function to execute while holding the lock
   * @param options - Lock options
   * @returns Result of the function, or null if lock couldn't be acquired
   */
  async withLock<T>(resource: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T | null> {
    const lock = await this.acquireWithRetry(resource, options);

    if (!lock) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(resource, lock.lockToken);
    }
  }

  /**
   * Check if a resource is currently locked.
   *
   * Note: This is a point-in-time check and the lock status
   * may change immediately after the check.
   *
   * @param resource - Unique identifier for the resource
   * @returns True if locked, false otherwise
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    const result = await this.redis.exists(lockKey);
    return result === 1;
  }
}
