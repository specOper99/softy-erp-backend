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
  private readonly ttlMs = 5 * 60 * 1000;

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
    await this.cacheService.del(this.getKey(token));
  }

  private getKey(token: string): string {
    return `${this.prefix}${token}`;
  }
}
