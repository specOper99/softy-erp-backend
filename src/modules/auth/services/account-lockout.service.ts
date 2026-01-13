import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

interface LockoutInfo {
  attempts: number;
  lockedUntil?: number; // Unix timestamp
}

/**
 * Account lockout service to prevent brute force attacks.
 * Uses Redis cache to track failed login attempts per user email.
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly attemptWindowMs: number;

  constructor(
    private readonly cacheService: CacheUtilsService,
    private readonly configService: ConfigService,
  ) {
    // Default: 5 attempts within 15 minutes, 30 minute lockout
    this.maxAttempts = this.configService.get<number>('LOCKOUT_MAX_ATTEMPTS', 5);
    this.lockoutDurationMs = this.configService.get<number>('LOCKOUT_DURATION_SECONDS', 30 * 60) * 1000;
    this.attemptWindowMs = this.configService.get<number>('LOCKOUT_WINDOW_SECONDS', 15 * 60) * 1000;
  }

  /**
   * Check if an account is currently locked out
   */
  async isLockedOut(email: string): Promise<{ locked: boolean; remainingMs?: number }> {
    const key = this.getKey(email);
    const info = await this.cacheService.get<LockoutInfo>(key);

    if (!info?.lockedUntil) {
      return { locked: false };
    }

    const now = Date.now();
    if (info.lockedUntil > now) {
      return {
        locked: true,
        remainingMs: info.lockedUntil - now,
      };
    }

    // Lockout has expired, clear it
    await this.cacheService.del(key);
    return { locked: false };
  }

  /**
   * Record a failed login attempt. Returns true if account is now locked.
   */
  async recordFailedAttempt(email: string): Promise<boolean> {
    const key = this.getKey(email);
    let info = await this.cacheService.get<LockoutInfo>(key);

    if (!info) {
      info = { attempts: 0 };
    }

    info.attempts += 1;

    if (info.attempts >= this.maxAttempts) {
      info.lockedUntil = Date.now() + this.lockoutDurationMs;
      this.logger.warn(`Account ${email} locked out for ${this.lockoutDurationMs / 1000}s`);
    }

    // Store with TTL matching attempt window (or lockout duration if locked)
    const ttl = info.lockedUntil
      ? Math.ceil((info.lockedUntil - Date.now()) / 1000)
      : Math.ceil(this.attemptWindowMs / 1000);

    // Convert seconds to ms for the service
    await this.cacheService.set(key, info, ttl * 1000);

    return !!info.lockedUntil;
  }

  /**
   * Clear failed attempts on successful login
   */
  async clearAttempts(email: string): Promise<void> {
    const key = this.getKey(email);
    await this.cacheService.del(key);
  }

  private getKey(email: string): string {
    return `lockout:${email.toLowerCase()}`;
  }
}
