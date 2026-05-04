import { BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Static utility class for tenant context propagation using AsyncLocalStorage.
 * Not injectable - use static methods directly: TenantContextService.getTenantId()
 */
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<string>();
  private static readonly userStorage = new AsyncLocalStorage<string>();

  static run<T>(tenantId: string, callback: () => T): T {
    return this.storage.run(tenantId, callback);
  }

  /**
   * Run a callback with both tenantId and userId in context.
   * Use this from middleware/guards after verifying the JWT so that
   * services can call getCurrentUserIdOrNull() to get the acting user.
   */
  static runWithUser<T>(tenantId: string, userId: string, callback: () => T): T {
    return this.storage.run(tenantId, () => this.userStorage.run(userId, callback));
  }

  static getTenantId(): string | undefined {
    return this.storage.getStore();
  }

  static getTenantIdOrThrow(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    return tenantId;
  }

  static getCurrentUserIdOrNull(): string | null {
    return this.userStorage.getStore() ?? null;
  }
}
