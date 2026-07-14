import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'isPlatformAdmin';
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
