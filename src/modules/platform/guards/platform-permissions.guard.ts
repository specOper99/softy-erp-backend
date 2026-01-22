import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/platform-permissions.decorator';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformRole } from '../enums/platform-role.enum';

interface PlatformUser {
  platformRole?: PlatformRole;
}

/**
 * Permission mapping from roles to permissions
 */
const ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  [PlatformRole.SUPER_ADMIN]: Object.values(PlatformPermission),
  [PlatformRole.SUPPORT_ADMIN]: [
    PlatformPermission.TENANTS_READ,
    PlatformPermission.TENANTS_SUSPEND,
    PlatformPermission.SUPPORT_IMPERSONATE,
    PlatformPermission.SUPPORT_VIEW_LOGS,
    PlatformPermission.SUPPORT_VIEW_ERRORS,
    PlatformPermission.DATA_EXPORT,
    PlatformPermission.ANALYTICS_VIEW,
    PlatformPermission.AUDIT_LOGS_READ,
    PlatformPermission.BILLING_READ,
  ],
  [PlatformRole.BILLING_ADMIN]: [
    PlatformPermission.TENANTS_READ,
    PlatformPermission.BILLING_READ,
    PlatformPermission.BILLING_MANAGE,
    PlatformPermission.BILLING_REFUND,
    PlatformPermission.BILLING_EXPORT,
    PlatformPermission.ANALYTICS_VIEW,
    PlatformPermission.AUDIT_LOGS_READ,
  ],
  [PlatformRole.COMPLIANCE_ADMIN]: [
    PlatformPermission.TENANTS_READ,
    PlatformPermission.DATA_EXPORT,
    PlatformPermission.DATA_DELETE,
    PlatformPermission.AUDIT_LOGS_READ,
    PlatformPermission.AUDIT_LOGS_EXPORT,
  ],
  [PlatformRole.SECURITY_ADMIN]: [
    PlatformPermission.TENANTS_READ,
    PlatformPermission.TENANTS_LOCK,
    PlatformPermission.SECURITY_POLICIES_MANAGE,
    PlatformPermission.SECURITY_FORCE_PASSWORD_RESET,
    PlatformPermission.SECURITY_REVOKE_SESSIONS,
    PlatformPermission.AUDIT_LOGS_READ,
    PlatformPermission.ANALYTICS_VIEW,
  ],
  [PlatformRole.ANALYTICS_VIEWER]: [
    PlatformPermission.TENANTS_READ,
    PlatformPermission.ANALYTICS_VIEW,
    PlatformPermission.AUDIT_LOGS_READ,
  ],
};

/**
 * Guard to check platform permissions based on role
 */
@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<PlatformPermission[]>(PLATFORM_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      // No permissions required
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: PlatformUser }>();
    const user = request.user;

    if (!user?.platformRole) {
      throw new ForbiddenException('Platform role required');
    }

    const userPermissions = ROLE_PERMISSIONS[user.platformRole] ?? [];

    const hasPermission = requiredPermissions.every((permission) => userPermissions.includes(permission));

    if (!hasPermission) {
      throw new ForbiddenException(`Missing required permissions: ${requiredPermissions.join(', ')}`);
    }

    return true;
  }
}
