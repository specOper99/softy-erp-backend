import { SetMetadata } from '@nestjs/common';

export const CACHEABLE_KEY = 'cacheable';
export const Cacheable = () => SetMetadata(CACHEABLE_KEY, true);
