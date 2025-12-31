import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Cache } from 'cache-manager';
import { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { NO_CACHE_KEY } from '../decorators/no-cache.decorator';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class GlobalCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GlobalCacheInterceptor.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Check for @NoCache decorator
    const noCache = this.reflector.get<boolean>(
      NO_CACHE_KEY,
      context.getHandler(),
    );
    if (noCache) {
      return next.handle();
    }

    // Generate tenant-scoped key
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      // Don't cache public/unscoped requests globally to be safe, or use 'public' prefix
      return next.handle();
    }

    const key = `cache:${tenantId}:${method}:${url}`;

    try {
      const cachedResponse = await this.cacheManager.get(key);
      if (cachedResponse) {
        this.logger.debug(`Cache Hit: ${key}`);
        return of(cachedResponse);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache read error: ${message}`);
    }

    return next.handle().pipe(
      tap((response) => {
        // We use a non-awaited async function here, which is generally discouraged in tap.
        // We will wrap the execution to avoid the lint error or use a separate way to cache.
        (async () => {
          try {
            // Cache for 60 seconds (default) or use metadata for custom TTL
            await this.cacheManager.set(key, response, 60000); // 60s in ms
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(`Cache write error: ${message}`);
          }
        })().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Unhandled error in cache side-effect: ${message}`);
        });
      }),
    );
  }
}
