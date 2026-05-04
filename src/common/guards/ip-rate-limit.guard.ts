import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { SKIP_IP_RATE_LIMIT_KEY } from '../decorators/skip-ip-rate-limit.decorator';
import { getClientIp } from '../utils/client-ip.util';

interface IpRateLimitInfo {
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
    private readonly cacheService: CacheUtilsService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    // 50 requests per minute soft limit (starts slowing down)
    this.softLimit = this.configService.get<number>('RATE_LIMIT_SOFT') || 50;
    // 100 requests per minute hard limit (blocks IP)
    this.hardLimit = this.configService.get<number>('RATE_LIMIT_HARD') || 100;
    // 1 minute window (default)
    const windowSeconds = this.configService.get<number>('RATE_LIMIT_WINDOW_SECONDS') || 60;
    this.windowMs = windowSeconds * 1000;

    // 15 minute block duration (default)
    const blockSeconds = this.configService.get<number>('RATE_LIMIT_BLOCK_SECONDS') || 900;
    this.blockDurationMs = blockSeconds * 1000;

    this.trustProxyHeaders = this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_IP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const isEnabled = this.configService.get<string>('RATE_LIMIT_ENABLED') !== 'false';
    if (!isEnabled) {
      const isProd = this.configService.get<string>('NODE_ENV') === 'production';
      if (isProd) {
        this.logger.warn('Security Alert: Attempt to disable rate limiting in production denied. Limits enforced.');
      } else {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = getClientIp(request, this.trustProxyHeaders, (message) => this.logger.warn(message));

    // Determine rate limit key — only IP or authenticated user ID.
    // Self-issued session cookies are NOT used: attackers can trivially rotate them.
    let key: string;

    if (ip) {
      key = `ip_rate:${ip}`;
    } else {
      const user = (request as Request & { user?: { id: string } }).user;
      if (user?.id) {
        key = `ip_rate:user:${user.id}`;
        this.logger.warn(`Rate limiting by user ID due to missing IP: ${user.id}`);
      } else {
        // No IP and no authenticated user — use a per-request denial to avoid unbounded
        // key creation. This is safer than issuing an attacker-controllable cookie.
        this.logger.warn('Rate limiting: cannot determine IP or user identity; rejecting request');
        throw new HttpException('common.too_many_requests', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // Check if IP is in the blocked set (separate key for blocked state).
    const blockedKey = `${key}:blocked`;
    const blockedInfo = await this.cacheService.get<IpRateLimitInfo>(blockedKey);
    const now = Date.now();

    if (blockedInfo?.blocked && blockedInfo.blockedUntil && blockedInfo.blockedUntil > now) {
      const remainingSecs = Math.ceil((blockedInfo.blockedUntil - now) / 1000);
      response?.setHeader?.('Retry-After', String(remainingSecs));
      throw new HttpException(
        { code: 'common.too_many_requests_blocked', args: { seconds: remainingSecs } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Atomic increment — uses Redis INCR (single round-trip, no TOCTOU).
    const isAuthenticated = !!(request as Request & { user?: unknown }).user;
    const effectiveSoftLimit = isAuthenticated ? this.softLimit : Math.floor((this.softLimit * 3) / 4);
    const effectiveHardLimit = isAuthenticated ? this.hardLimit : Math.floor((this.hardLimit * 3) / 4);

    const count = await this.cacheService.increment(key, this.windowMs);

    if (count > effectiveHardLimit) {
      const blockInfo: IpRateLimitInfo = {
        firstRequest: now,
        blocked: true,
        blockedUntil: now + this.blockDurationMs,
      };
      await this.cacheService.set(blockedKey, blockInfo, this.blockDurationMs);
      this.logger.warn(
        `Identifier ${key} blocked for exceeding rate limit (${count} requests, authenticated: ${isAuthenticated})`,
      );

      const remainingSecs = Math.ceil(this.blockDurationMs / 1000);
      response?.setHeader?.('Retry-After', String(remainingSecs));
      throw new HttpException(
        `Rate limit exceeded. Blocked for ${this.blockDurationMs / 60000} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (count > effectiveSoftLimit) {
      response?.setHeader?.('Retry-After', '60');
      throw new HttpException(
        {
          message: 'common.too_many_requests',
          retryAfterSeconds: 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
