import { SetMetadata } from '@nestjs/common';

/**
 * PlatformAdmin Decorator
 *
 * Marks an endpoint as requiring platform administrator privileges.
 * This is used in conjunction with @TargetTenant() for cross-tenant operations.
 *
 * Security Model:
 * - Only SUPER_ADMIN and designated platform roles can access
 * - All operations are logged in platform audit trail
 * - Must provide reason for sensitive operations (via @RequireReason)
 *
 * Usage:
 * ```typescript
 * @Post('tenants/:tenantId/users/:userId/deactivate')
 * @PlatformAdmin()
 * @RequireReason()
 * async deactivateUser(@TargetTenant() tenantId: string, ...) { }
 * ```
 */
export const PLATFORM_ADMIN_KEY = 'isPlatformAdmin';
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
