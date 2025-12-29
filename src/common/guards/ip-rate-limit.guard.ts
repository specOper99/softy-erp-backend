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
import type { Cache } from 'cache-manager';
import type { Request } from 'express';

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
  private readonly progressiveDelayMs: number;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // 50 requests per minute soft limit (starts slowing down)
    this.softLimit = parseInt(process.env.RATE_LIMIT_SOFT || '50', 10);
    // 100 requests per minute hard limit (blocks IP)
    this.hardLimit = parseInt(process.env.RATE_LIMIT_HARD || '100', 10);
    // 1 minute window
    this.windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
    // 15 minute block duration
    this.blockDurationMs = parseInt(
      process.env.RATE_LIMIT_BLOCK_MS || '900000',
      10,
    );
    // 500ms progressive delay per request over soft limit
    this.progressiveDelayMs = parseInt(
      process.env.RATE_LIMIT_DELAY_MS || '500',
      10,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIp(request);
    const key = `ip_rate:${ip}`;

    // Get current rate limit info
    let info = await this.cacheManager.get<IpRateLimitInfo>(key);
    const now = Date.now();

    // Check if IP is blocked
    if (info?.blocked && info.blockedUntil && info.blockedUntil > now) {
      const remainingSecs = Math.ceil((info.blockedUntil - now) / 1000);
      this.logger.warn(
        `Blocked IP ${ip} attempted access. Remaining: ${remainingSecs}s`,
      );
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
        throw new HttpException(
          `Rate limit exceeded. IP blocked for ${this.blockDurationMs / 60000} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check soft limit - apply progressive delay
      if (info.count > this.softLimit) {
        const delayMultiplier = info.count - this.softLimit;
        const delay = Math.min(delayMultiplier * this.progressiveDelayMs, 5000); // Max 5s delay
        await this.sleep(delay);
        this.logger.debug(`IP ${ip} rate limited with ${delay}ms delay`);
      }
    }

    // Update cache
    const ttl = Math.ceil(this.windowMs / 1000);
    await this.cacheManager.set(key, info, ttl * 1000);

    return true;
  }

  private getClientIp(request: Request): string {
    // Check various headers for proxied requests
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp;
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
