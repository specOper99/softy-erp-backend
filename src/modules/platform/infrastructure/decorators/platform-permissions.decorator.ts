import { SetMetadata } from '@nestjs/common';
import type { PlatformPermission } from '../../domain/enums/platform-permission.enum';

export const PLATFORM_PERMISSIONS_KEY = 'platform_permissions';

export const RequirePlatformPermissions = (...permissions: PlatformPermission[]) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);
