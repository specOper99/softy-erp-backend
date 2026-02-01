/**
 * Idempotency Interceptor
 *
 * Prevents duplicate processing of financial operations by tracking idempotency keys.
 * This is critical for operations like transaction creation where retries could
 * cause duplicate financial records.
 *
 * How it works:
 * 1. Client sends request with `X-Idempotency-Key` header
 * 2. Interceptor checks if key was processed before
 * 3. If processed: returns cached response
 * 4. If new: processes request, caches response, returns it
 *
 * @example
 * ```typescript
 * // In controller:
 * @Post()
 * @UseInterceptors(IdempotencyInterceptor)
 * @Idempotent({ ttl: 86400 }) // Cache for 24 hours
 * create(@Body() dto: CreateTransactionDto) { ... }
 *
 * // Client request:
 * POST /transactions
 * X-Idempotency-Key: unique-client-generated-key-123
 * ```
 */
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { TenantContextService } from '../services/tenant-context.service';

/** Metadata key for idempotency configuration */
export const IDEMPOTENT_KEY = 'idempotent';

/** Header name for idempotency key */
export const IDEMPOTENCY_HEADER = 'x-idempotency-key';

/** Default TTL for idempotency cache (24 hours) */
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum length for idempotency key */
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/** Minimum length for idempotency key */
const MIN_IDEMPOTENCY_KEY_LENGTH = 16;

/**
 * Configuration for idempotent operations
 */
export interface IdempotentConfig {
  /** Time-to-live for cached response in milliseconds (default: 24 hours) */
  ttl?: number;
  /** Whether idempotency key is required (default: false - optional) */
  required?: boolean;
  /** Custom cache key prefix */
  keyPrefix?: string;
}

/**
 * Decorator to mark a route as idempotent
 */
export const Idempotent = (config: IdempotentConfig = {}) => SetMetadata(IDEMPOTENT_KEY, config);

/**
 * Structure of cached idempotency response
 */
interface CachedResponse {
  /** HTTP status code */
  status: number;
  /** Response body */
  body: unknown;
  /** Timestamp when response was cached */
  cachedAt: number;
}

/**
 * Processing status for in-flight requests
 */
interface ProcessingStatus {
  /** Request is currently being processed */
  processing: true;
  /** Timestamp when processing started */
  startedAt: number;
}

type CacheEntry = CachedResponse | ProcessingStatus;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const config = this.reflector.get<IdempotentConfig>(IDEMPOTENT_KEY, context.getHandler());

    // No idempotency config = standard processing
    if (!config) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = this.extractIdempotencyKey(request);

    // No key provided
    if (!idempotencyKey) {
      if (config.required) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: `${IDEMPOTENCY_HEADER} header is required for this operation`,
        });
      }
      // Key not required and not provided - proceed normally
      return next.handle();
    }

    // Validate key format
    this.validateIdempotencyKey(idempotencyKey);

    const cacheKey = this.buildCacheKey(idempotencyKey, config);
    const ttl = config.ttl || DEFAULT_IDEMPOTENCY_TTL_MS;

    // Check if already processed or in-progress
    const cached = await this.cacheUtils.get<CacheEntry>(cacheKey);

    if (cached) {
      if ('processing' in cached && cached.processing) {
        // Another request with same key is in progress
        // This prevents race conditions in concurrent duplicate requests
        const processingTime = Date.now() - cached.startedAt;
        if (processingTime < 30000) {
          // Within 30 seconds, assume still processing
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_IN_USE',
            message: 'A request with this idempotency key is currently being processed',
          });
        }
        // Stale processing marker - proceed (cleanup will happen)
      } else if ('body' in cached) {
        // Return cached response
        this.logger.debug(`Returning cached response for idempotency key: ${idempotencyKey}`);
        return of(cached.body);
      }
    }

    // Mark as processing
    await this.cacheUtils.set(cacheKey, { processing: true, startedAt: Date.now() } as ProcessingStatus, 60000);

    // Process the request
    return next.handle().pipe(
      tap(async (response) => {
        // Cache successful response
        const cachedResponse: CachedResponse = {
          status: 200,
          body: response,
          cachedAt: Date.now(),
        };
        await this.cacheUtils.set(cacheKey, cachedResponse, ttl);
        this.logger.debug(`Cached response for idempotency key: ${idempotencyKey}`);
      }),
      catchError(async (error) => {
        // Remove processing marker on error (don't cache errors)
        await this.cacheUtils.del(cacheKey);
        return throwError(() => error);
      }),
    );
  }

  private extractIdempotencyKey(request: Request): string | null {
    const key = request.headers[IDEMPOTENCY_HEADER];
    if (Array.isArray(key)) {
      return key[0] || null;
    }
    return key || null;
  }

  private validateIdempotencyKey(key: string): void {
    if (key.length < MIN_IDEMPOTENCY_KEY_LENGTH) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_TOO_SHORT',
        message: `Idempotency key must be at least ${MIN_IDEMPOTENCY_KEY_LENGTH} characters`,
      });
    }

    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_TOO_LONG',
        message: `Idempotency key must not exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      });
    }

    // Only allow alphanumeric, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_INVALID_FORMAT',
        message: 'Idempotency key must only contain alphanumeric characters, hyphens, and underscores',
      });
    }
  }

  private buildCacheKey(idempotencyKey: string, config: IdempotentConfig): string {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const prefix = config.keyPrefix || 'idempotency';
    return `${prefix}:${tenantId}:${idempotencyKey}`;
  }
}
