import { SetMetadata } from '@nestjs/common';
import { PlatformPermission } from '../enums/platform-permission.enum';

export const PLATFORM_PERMISSIONS_KEY = 'platform_permissions';

/**
 * Decorator to require specific platform permissions for a route
 */
export const RequirePlatformPermissions = (...permissions: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);
