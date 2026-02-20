import { Injectable } from '@nestjs/common';
import { CacheUtilsService } from './cache-utils.service';

const AVAILABILITY_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AvailabilityCacheOwnerService {
  constructor(private readonly cacheUtils: CacheUtilsService) {}

  getKey(tenantId: string, packageId: string, date: string): string {
    return `availability:${tenantId}:${packageId}:${date}`;
  }

  async getAvailability<T>(tenantId: string, packageId: string, date: string): Promise<T | undefined> {
    return this.cacheUtils.get<T>(this.getKey(tenantId, packageId, date));
  }

  async setAvailability<T>(tenantId: string, packageId: string, date: string, value: T): Promise<void> {
    await this.cacheUtils.set(this.getKey(tenantId, packageId, date), value, AVAILABILITY_CACHE_TTL_MS);
  }

  async delAvailability(tenantId: string, packageId: string, date: string): Promise<void> {
    await this.cacheUtils.del(this.getKey(tenantId, packageId, date));
  }
}
