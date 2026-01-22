import { SetMetadata } from '@nestjs/common';

export const ALLOW_TENANT_BYPASS_KEY = 'allow_tenant_bypass';

/**
 * Decorator to explicitly allow bypassing tenant isolation for platform operations
 */
export const AllowTenantBypass = () => SetMetadata(ALLOW_TENANT_BYPASS_KEY, true);
