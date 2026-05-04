import { SetMetadata } from '@nestjs/common';

export const CACHEABLE_KEY = 'cacheable';
export const CACHEABLE_TTL_KEY = 'cacheable_ttl';
/**
 * Mark an endpoint's GET response as cacheable.
 * @param ttlMs Cache TTL in milliseconds. Omit to use the interceptor default (configurable).
 */
export const Cacheable = (ttlMs?: number) => SetMetadata(CACHEABLE_KEY, ttlMs ?? true);
