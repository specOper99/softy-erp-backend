import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  userId?: string;
  method?: string;
  path?: string;
  ip?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context (if available)
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the correlation ID from the current request context
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}
