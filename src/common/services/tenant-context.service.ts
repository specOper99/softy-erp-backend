import { BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Tenant + user context via AsyncLocalStorage (static, not injectable). */
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<string>();
  private static readonly userStorage = new AsyncLocalStorage<string>();

  static run<T>(tenantId: string, callback: () => T): T {
    return this.storage.run(tenantId, callback);
  }

  static runWithUser<T>(tenantId: string, userId: string, callback: () => T): T {
    return this.storage.run(tenantId, () => this.userStorage.run(userId, callback));
  }

  static getTenantId(): string | undefined {
    return this.storage.getStore();
  }

  static getTenantIdOrThrow(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) throw new BadRequestException('common.tenant_missing');
    return tenantId;
  }

  static getCurrentUserIdOrNull(): string | null {
    return this.userStorage.getStore() ?? null;
  }
}
