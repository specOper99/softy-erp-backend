import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<string>();

  static run(tenantId: string, callback: () => void) {
    this.storage.run(tenantId, callback);
  }

  static getTenantId(): string | undefined {
    return this.storage.getStore();
  }
}
