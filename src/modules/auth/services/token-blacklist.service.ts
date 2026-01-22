import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import * as crypto from 'node:crypto';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly PREFIX = 'blacklist:';

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Blacklist a token until its expiration.
   * @param token The JWT token string (or its JTI)
   * @param expiresInSeconds Duration until the token naturally expires.
   */
  async blacklist(token: string, expiresInSeconds: number): Promise<void> {
    const key = this.getKey(token);
    // Use slightly longer TTL to be safe, e.g. +30 seconds
    const ttl = (expiresInSeconds + 30) * 1000;
    await this.cacheManager.set(key, 'true', ttl);
    this.logger.debug(`Blacklisted token for ${expiresInSeconds}s`);
  }

  /**
   * Check if a token is blacklisted.
   * @param token The JWT token string (or its JTI)
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const key = this.getKey(token);
    const result = await this.cacheManager.get(key);
    return !!result;
  }

  private getKey(token: string): string {
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    return `${this.PREFIX}${digest}`;
  }
}
