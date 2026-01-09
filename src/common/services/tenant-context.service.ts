import { BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Static utility class for tenant context propagation using AsyncLocalStorage.
 * Not injectable - use static methods directly: TenantContextService.getTenantId()
 */
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<string>();

  static run<T>(tenantId: string, callback: () => T): T {
    return this.storage.run(tenantId, callback);
  }

  static getTenantId(): string | undefined {
    return this.storage.getStore();
  }

  static getTenantIdOrThrow(): string {
    const tenantId = this.getStore();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }
    return tenantId;
  }

  private static getStore(): string | undefined {
    return this.storage.getStore();
  }
}
