import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { validate as isUUID } from 'uuid';

/**
 * TargetTenant Decorator
 *
 * Extracts and validates tenantId from route parameters for platform admin operations.
 * This decorator should ONLY be used in platform controllers where cross-tenant access
 * is explicitly authorized and audited.
 *
 * Security Considerations:
 * - Must be used with @PlatformAdmin() guard
 * - Logs all cross-tenant access attempts
 * - Validates UUID format
 * - Does NOT set TenantContext (admin's own tenant remains in context)
 *
 * Example:
 * ```typescript
 * @Get('tenants/:tenantId/users')
 * @PlatformAdmin()
 * async listUsers(@TargetTenant() targetTenantId: string) {
 *   return this.service.listUsers(targetTenantId);
 * }
 * ```
 */
export const TargetTenant = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const tenantId = request.params?.tenantId || request.query?.tenantId;

  if (!tenantId) {
    throw new ForbiddenException('platform.target_tenant_required');
  }

  if (!isUUID(tenantId)) {
    throw new ForbiddenException('platform.invalid_tenant_id_format');
  }

  // Store for audit logging
  request.targetTenantId = tenantId;

  return tenantId;
});
