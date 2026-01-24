import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

interface PlatformMfaTempTokenPayload {
  platformUserId: string;
  sessionId: string;
  ipHash: string;
  userAgentHash: string;
}

@Injectable()
export class PlatformMfaTokenService {
  private static readonly TTL_MS = 5 * 60 * 1000;
  private static readonly PREFIX = 'platform:mfa:temp:';

  constructor(private readonly cache: CacheUtilsService) {}

  async create(payload: PlatformMfaTempTokenPayload): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.cache.set(this.key(token), payload, PlatformMfaTokenService.TTL_MS);
    return token;
  }

  /**
   * One-time token consumption (replay-safe).
   */
  async consume(token: string): Promise<PlatformMfaTempTokenPayload | null> {
    const key = this.key(token);
    const payload = await this.cache.get<PlatformMfaTempTokenPayload>(key);
    if (!payload) {
      return null;
    }
    await this.cache.del(key);
    return payload;
  }

  static hashIp(ipAddress: string): string {
    return createHash('sha256').update(ipAddress).digest('hex');
  }

  static hashUserAgent(userAgent: string): string {
    return createHash('sha256').update(userAgent.slice(0, 200)).digest('hex');
  }

  private key(token: string): string {
    return `${PlatformMfaTokenService.PREFIX}${token}`;
  }
}
