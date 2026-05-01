import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

export interface MfaTempTokenPayload {
  userId: string;
  tenantId: string;
  rememberMe: boolean;
}

@Injectable()
export class MfaTokenService {
  private readonly prefix = 'mfa:temp:';
  private readonly attemptsPrefix = 'mfa:attempts:';
  private readonly ttlMs = 5 * 60 * 1000;
  /** Max failed TOTP attempts before the temp token is invalidated (force re-login). */
  static readonly MAX_TOTP_ATTEMPTS = 5;

  constructor(private readonly cacheService: CacheUtilsService) {}

  async createTempToken(payload: MfaTempTokenPayload): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.cacheService.set(this.getKey(token), payload, this.ttlMs);
    return token;
  }

  async getTempToken(token: string): Promise<MfaTempTokenPayload | undefined> {
    return this.cacheService.get<MfaTempTokenPayload>(this.getKey(token));
  }

  async consumeTempToken(token: string): Promise<void> {
    await Promise.all([this.cacheService.del(this.getKey(token)), this.cacheService.del(this.getAttemptsKey(token))]);
  }

  /**
   * Record a failed TOTP attempt for the given temp token.
   * Returns the new attempt count. When the count reaches MAX_TOTP_ATTEMPTS,
   * the caller must invalidate the temp token to force re-login.
   * Uses an atomic increment to prevent race conditions under concurrent requests.
   */
  async recordFailedAttempt(token: string): Promise<number> {
    const key = this.getAttemptsKey(token);
    return this.cacheService.increment(key, this.ttlMs);
  }

  private getKey(token: string): string {
    return `${this.prefix}${token}`;
  }

  private getAttemptsKey(token: string): string {
    // Hash the raw token so the raw value is never used as a Redis key.
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    return `${this.attemptsPrefix}${hashed}`;
  }
}
