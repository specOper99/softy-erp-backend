import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

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
    this.logger.debug(`Blacklisted token: ${key} for ${expiresInSeconds}s`);
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
    // If token is very long (JWT), we might want to hash it or just use it.
    // For safety and key length limits, let's use the last 64 chars or hash it.
    // But hashing adds CPU overlap. Since access tokens are usually < 1KB, Redis keys can handle it.
    // However, if we can extract JTI (unique ID) from payload, that is better.
    // But JwtStrategy sees the raw token before verifying, so we might check raw token signature.
    // A simple approach is to use the full token as key (or a hash of it).
    // Let's use the full token for simplicity unless performance is issue.
    // Actually, full JWT as key is fine but wasteful.
    // Let's rely on the caller to pass something unique.
    // BUT JwtStrategy.validate() receives `payload`. It doesn't receive the raw token easily unless we modify it.
    // PROVISIONAL: We will use the raw token string as the key.
    return `${this.PREFIX}${token}`;
  }
}
