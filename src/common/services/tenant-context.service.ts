import { AsyncLocalStorage } from 'async_hooks';

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
}
