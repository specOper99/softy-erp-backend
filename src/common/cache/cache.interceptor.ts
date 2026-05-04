import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as crypto from 'node:crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHEABLE_KEY } from '../decorators/cacheable.decorator';
import { NO_CACHE_KEY } from '../decorators/no-cache.decorator';
import { TenantContextService } from '../services/tenant-context.service';
import { toErrorMessage } from '../utils/error.util';
import { CacheUtilsService } from './cache-utils.service';

/** Default cache TTL in milliseconds (5 minutes). Overridable via CACHE_DEFAULT_TTL_MS env var. */
const DEFAULT_CACHE_TTL_MS = 300_000;

@Injectable()
export class GlobalCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GlobalCacheInterceptor.name);

  constructor(
    private readonly cacheService: CacheUtilsService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
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
    const cacheableMeta = this.reflector.getAllAndOverride<true | number | undefined>(CACHEABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cacheableMeta) {
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
    const key = `cache:${tenantId}:${userKeyPart}:${method}:${this.buildUrlKey(url)}`;

    // Determine effective TTL: per-endpoint number > configurable default
    const defaultTtl = this.configService.get<number>('CACHE_DEFAULT_TTL_MS') ?? DEFAULT_CACHE_TTL_MS;
    const ttlMs = typeof cacheableMeta === 'number' ? cacheableMeta : defaultTtl;

    try {
      const cachedResponse = await this.cacheService.get(key);
      if (cachedResponse) {
        this.logger.debug(`Cache Hit: ${key}`);
        return of(cachedResponse);
      }
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      this.logger.warn(`Cache read error: ${message}`);
    }

    return next.handle().pipe(
      tap((response) => {
        // We use a non-awaited async function here, which is generally discouraged in tap.
        // We will wrap the execution to avoid the lint error or use a separate way to cache.
        (async () => {
          try {
            await this.cacheService.set(key, response, ttlMs);
          } catch (error: unknown) {
            const message = toErrorMessage(error);
            this.logger.warn(`Cache write error: ${message}`);
          }
        })().catch((err: unknown) => {
          const message = toErrorMessage(err);
          this.logger.error(`Unhandled error in cache side-effect: ${message}`);
        });
      }),
    );
  }

  /**
   * Build a stable cache key component from a URL.
   * Only the pathname is used literally; query params are sorted, then hashed.
   * This prevents cache poisoning via arbitrary query string ordering and
   * avoids unbounded key growth from user-supplied values in URLs.
   */
  private buildUrlKey(url: string): string {
    try {
      const parsed = new URL(url, 'http://localhost');
      const params = Array.from(parsed.searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      const paramHash = params.length > 0 ? crypto.createHash('sha256').update(params).digest('hex').slice(0, 16) : '';
      return paramHash ? `${parsed.pathname}:${paramHash}` : parsed.pathname;
    } catch {
      // Fallback: hash the whole URL to avoid leaking arbitrary values into key space
      return crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
    }
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
