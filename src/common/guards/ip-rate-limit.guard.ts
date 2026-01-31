import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CacheUtilsService } from '../cache/cache-utils.service';
import { SKIP_IP_RATE_LIMIT_KEY } from '../decorators/skip-ip-rate-limit.decorator';
import { getClientIp } from '../utils/client-ip.util';

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

    // Determine rate limit key with intelligent fallback
    let key: string;

    if (ip) {
      // Primary: Use IP address
      key = `ip_rate:${ip}`;
    } else {
      // IP extraction failed - use fallback strategy
      const user = (request as Request & { user?: { id: string } }).user;

      if (user?.id) {
        // Authenticated user - use user ID
        key = `ip_rate:user:${user.id}`;
        this.logger.warn(`Rate limiting by user ID due to missing IP: ${user.id}`);
      } else {
        // Anonymous user - use or create session identifier
        const sessionId = this.getOrCreateSessionId(request, response);
        key = `ip_rate:session:${sessionId}`;
        this.logger.debug(`Rate limiting by session due to missing IP: ${sessionId}`);
      }
    }

    // Get current rate limit info
    let info = await this.cacheService.get<IpRateLimitInfo>(key);
    const now = Date.now();

    // Check if IP is blocked
    if (info?.blocked && info.blockedUntil && info.blockedUntil > now) {
      const remainingSecs = Math.ceil((info.blockedUntil - now) / 1000);
      response?.setHeader?.('Retry-After', String(remainingSecs));
      throw new HttpException(`Too many requests. Blocked for ${remainingSecs} seconds.`, HttpStatus.TOO_MANY_REQUESTS);
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

      // Authenticated users get full limits, anonymous get half
      const isAuthenticated = !!(request as Request & { user?: unknown }).user;
      const effectiveSoftLimit = isAuthenticated ? this.softLimit : Math.floor(this.softLimit / 2);
      const effectiveHardLimit = isAuthenticated ? this.hardLimit : Math.floor(this.hardLimit / 2);

      // Check hard limit - block IP
      if (info.count > effectiveHardLimit) {
        info.blocked = true;
        info.blockedUntil = now + this.blockDurationMs;
        await this.cacheService.set(key, info, this.blockDurationMs);
        this.logger.warn(
          `Identifier ${key} blocked for exceeding rate limit (${info.count} requests, authenticated: ${isAuthenticated})`,
        );

        const remainingSecs = Math.ceil(this.blockDurationMs / 1000);
        response?.setHeader?.('Retry-After', String(remainingSecs));
        throw new HttpException(
          `Rate limit exceeded. Blocked for ${this.blockDurationMs / 60000} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check soft limit - reject instead of server-side sleeping (avoids self-DoS)
      if (info.count > effectiveSoftLimit) {
        const windowRemainingMs = Math.max(0, this.windowMs - (now - info.firstRequest));
        const retryAfterSeconds = Math.max(1, Math.ceil(windowRemainingMs / 1000));
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
    await this.cacheService.set(key, info, this.windowMs);

    return true;
  }

  /**
   * Get or create a session identifier for rate limiting anonymous users without valid IPs.
   * Uses a secure cookie to maintain session identity across requests.
   */
  private getOrCreateSessionId(request: Request, response: Response): string {
    const existingSession = (request.cookies as Record<string, unknown> | undefined)?.['rate_limit_session'];
    if (existingSession && typeof existingSession === 'string' && existingSession.length === 32) {
      return existingSession;
    }

    // Generate cryptographically secure random session ID
    const sessionId = randomBytes(16).toString('hex');

    // Set cookie with appropriate security flags
    response.cookie('rate_limit_session', sessionId, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: this.windowMs * 2, // 2x the rate limit window
    });

    return sessionId;
  }
}
