import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import type { Request, Response } from 'express';

interface IpRateLimitInfo {
  count: number;
  firstRequest: number;
  blocked: boolean;
  blockedUntil?: number;
}

/**
 * Progressive IP-based rate limiting guard.
 * - Tracks requests per IP address
 * - Implements progressive delays (soft limit)
 * - Blocks IPs after hard limit exceeded
 * - Configurable via environment variables
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IpRateLimitGuard.name);

  // Default configuration (can be overridden by env vars)
  private readonly softLimit: number;
  private readonly hardLimit: number;
  private readonly windowMs: number;
  private readonly blockDurationMs: number;
  private readonly trustProxyHeaders: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    // Fallback cache manager for environments where CACHE_MANAGER is not provided (e.g., unit tests)
    if (!this.cacheManager) {
      this.cacheManager = {
        async get<T>(_key: string): Promise<T | undefined> {
          return await Promise.resolve(undefined);
        },
        async set(_key: string, _value: unknown, _ttl?: number): Promise<void> {
          await Promise.resolve();
        },
      } as unknown as Cache;
    }
    // 50 requests per minute soft limit (starts slowing down)
    this.softLimit = this.configService.get<number>('RATE_LIMIT_SOFT') || 50;
    // 100 requests per minute hard limit (blocks IP)
    this.hardLimit = this.configService.get<number>('RATE_LIMIT_HARD') || 100;
    // 1 minute window (default)
    const windowSeconds =
      this.configService.get<number>('RATE_LIMIT_WINDOW_SECONDS') || 60;
    this.windowMs = windowSeconds * 1000;

    // 15 minute block duration (default)
    const blockSeconds =
      this.configService.get<number>('RATE_LIMIT_BLOCK_SECONDS') || 900;
    this.blockDurationMs = blockSeconds * 1000;

    // Only trust proxy headers when explicitly enabled
    this.trustProxyHeaders =
      this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = this.getClientIp(request);
    const key = `ip_rate:${ip}`;

    // Get current rate limit info
    let info = await this.cacheManager.get<IpRateLimitInfo>(key);
    const now = Date.now();

    // Check if IP is blocked
    if (info?.blocked && info.blockedUntil && info.blockedUntil > now) {
      const remainingSecs = Math.ceil((info.blockedUntil - now) / 1000);
      response?.setHeader?.('Retry-After', String(remainingSecs));
      throw new HttpException(
        `Too many requests. IP blocked for ${remainingSecs} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Initialize or reset if window expired
    if (!info || now - info.firstRequest > this.windowMs) {
      info = {
        count: 1,
        firstRequest: now,
        blocked: false,
      };
    } else {
      info.count++;

      // Check hard limit - block IP
      if (info.count > this.hardLimit) {
        info.blocked = true;
        info.blockedUntil = now + this.blockDurationMs;
        await this.cacheManager.set(key, info, this.blockDurationMs);
        this.logger.warn(
          `IP ${ip} blocked for exceeding rate limit (${info.count} requests)`,
        );

        const remainingSecs = Math.ceil(this.blockDurationMs / 1000);
        response?.setHeader?.('Retry-After', String(remainingSecs));
        throw new HttpException(
          `Rate limit exceeded. IP blocked for ${this.blockDurationMs / 60000} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check soft limit - reject instead of server-side sleeping (avoids self-DoS)
      if (info.count > this.softLimit) {
        const windowRemainingMs = Math.max(
          0,
          this.windowMs - (now - info.firstRequest),
        );
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(windowRemainingMs / 1000),
        );
        response?.setHeader?.('Retry-After', String(retryAfterSeconds));
        throw new HttpException(
          {
            message: 'Too many requests',
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Update cache
    await this.cacheManager.set(key, info, this.windowMs);

    return true;
  }

  private getClientIp(request: Request): string {
    // Check various headers for proxied requests
    if (this.trustProxyHeaders) {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      const realIp = request.headers['x-real-ip'];
      if (typeof realIp === 'string') {
        return realIp;
      }
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
