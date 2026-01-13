import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as crypto from 'node:crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHEABLE_KEY } from '../decorators/cacheable.decorator';
import { NO_CACHE_KEY } from '../decorators/no-cache.decorator';
import { TenantContextService } from '../services/tenant-context.service';
import { CacheUtilsService } from './cache-utils.service';

@Injectable()
export class GlobalCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GlobalCacheInterceptor.name);

  constructor(
    private readonly cacheService: CacheUtilsService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Safe default: caching is opt-in via @Cacheable()
    const cacheable = this.reflector.getAllAndOverride<boolean>(CACHEABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cacheable) {
      return next.handle();
    }

    // Check for @NoCache decorator
    const noCache = this.reflector.getAllAndOverride<boolean>(NO_CACHE_KEY, [context.getHandler(), context.getClass()]);
    if (noCache) {
      return next.handle();
    }

    // Generate tenant-scoped key
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      // Don't cache public/unscoped requests globally to be safe, or use 'public' prefix
      return next.handle();
    }

    const userKeyPart = this.getUserCacheKeyPart(request);
    const key = `cache:${tenantId}:${userKeyPart}:${method}:${url}`;

    try {
      const cachedResponse = await this.cacheService.get(key);
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
            await this.cacheService.set(key, response, 60000); // 60s in ms
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Cache write error: ${message}`);
          }
        })().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Unhandled error in cache side-effect: ${message}`);
        });
      }),
    );
  }

  private getUserCacheKeyPart(request: Request): string {
    const user = (request as { user?: unknown }).user;

    if (user && typeof user === 'object' && user !== null) {
      const maybeUser = user as { id?: unknown; sub?: unknown };
      const id = maybeUser.id;
      const sub = maybeUser.sub;

      if (typeof id === 'string' && id.length > 0) {
        return `user:${id}`;
      }
      if (typeof sub === 'string' && sub.length > 0) {
        return `user:${sub}`;
      }
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenHash = token.length > 0 ? crypto.createHash('sha256').update(token).digest('hex') : 'empty';
      return `token:${tokenHash}`;
    }

    return 'anon';
  }
}
