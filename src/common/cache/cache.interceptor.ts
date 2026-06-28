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
    if (request.method !== 'GET') return next.handle();

    const cacheableMeta = this.reflector.getAllAndOverride<true | number | undefined>(CACHEABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cacheableMeta) return next.handle();

    const noCache = this.reflector.getAllAndOverride<boolean>(NO_CACHE_KEY, [context.getHandler(), context.getClass()]);
    if (noCache) return next.handle();

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) return next.handle();

    const key = `cache:${tenantId}:${this.getUserCacheKeyPart(request)}:GET:${this.buildUrlKey(request.url)}`;
    const defaultTtl = this.configService.get<number>('CACHE_DEFAULT_TTL_MS') ?? DEFAULT_CACHE_TTL_MS;
    const ttlMs = typeof cacheableMeta === 'number' ? cacheableMeta : defaultTtl;

    try {
      const cachedResponse = await this.cacheService.get(key);
      if (cachedResponse) {
        this.logger.debug(`Cache Hit: ${key}`);
        return of(cachedResponse);
      }
    } catch (error: unknown) {
      this.logger.warn(`Cache read error: ${toErrorMessage(error)}`);
    }

    return next.handle().pipe(
      tap((response) => {
        void Promise.resolve(this.cacheService.set(key, response, ttlMs)).catch((error: unknown) => {
          this.logger.warn(`Cache write error: ${toErrorMessage(error)}`);
        });
      }),
    );
  }

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
      return crypto.createHash('sha256').update(url).digest('hex').slice(0, 32);
    }
  }

  private getUserCacheKeyPart(request: Request): string {
    const user = (request as { user?: unknown }).user;
    if (user && typeof user === 'object' && user !== null) {
      const maybeUser = user as { id?: unknown; sub?: unknown };
      if (typeof maybeUser.id === 'string' && maybeUser.id.length > 0) return `user:${maybeUser.id}`;
      if (typeof maybeUser.sub === 'string' && maybeUser.sub.length > 0) return `user:${maybeUser.sub}`;
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
