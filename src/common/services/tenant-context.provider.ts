import { Injectable } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Injectable wrapper around the static TenantContextService.
 * Provides DI-friendly access to tenant context for easier testing.
 *
 * Usage:
 *   constructor(private tenantContext: TenantContextProvider) {}
 *   const tenantId = this.tenantContext.getTenantId();
 */
@Injectable()
export class TenantContextProvider {
  /**
   * Get the current tenant ID from async context.
   * @returns The tenant ID or undefined if not in tenant context.
   */
  getTenantId(): string | undefined {
    return TenantContextService.getTenantId();
  }

  /**
   * Get the current tenant ID, throwing if not available.
   * Use when tenant context is required.
   * @throws Error if tenant context is not available.
   */
  getRequiredTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required but not available');
    }
    return tenantId;
  }
}
