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

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IpRateLimitGuard.name);
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
    this.softLimit = this.configService.get<number>('RATE_LIMIT_SOFT') || 50;
    this.hardLimit = this.configService.get<number>('RATE_LIMIT_HARD') || 100;
    this.windowMs = (this.configService.get<number>('RATE_LIMIT_WINDOW_SECONDS') || 60) * 1000;
    this.blockDurationMs = (this.configService.get<number>('RATE_LIMIT_BLOCK_SECONDS') || 900) * 1000;
    this.trustProxyHeaders = this.configService.get<string>('TRUST_PROXY') === 'true';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_IP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const isEnabled = this.configService.get<string>('RATE_LIMIT_ENABLED') !== 'false';
    if (!isEnabled) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        this.logger.warn('Security Alert: Attempt to disable rate limiting in production denied. Limits enforced.');
      } else {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = this.resolveRateLimitKey(request);
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

    const isAuthenticated = !!(request as Request & { user?: unknown }).user;
    const scale = isAuthenticated ? 1 : 0.75;
    const count = await this.cacheService.increment(key, this.windowMs);

    if (count > Math.floor(this.hardLimit * scale)) {
      await this.cacheService.set(
        blockedKey,
        { firstRequest: now, blocked: true, blockedUntil: now + this.blockDurationMs },
        this.blockDurationMs,
      );
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

    if (count > Math.floor(this.softLimit * scale)) {
      response?.setHeader?.('Retry-After', '60');
      throw new HttpException(
        { message: 'common.too_many_requests', retryAfterSeconds: 60 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveRateLimitKey(request: Request): string {
    const ip = getClientIp(request, this.trustProxyHeaders, (message) => this.logger.warn(message));
    if (ip) return `ip_rate:${ip}`;

    const user = (request as Request & { user?: { id: string } }).user;
    if (user?.id) {
      this.logger.warn(`Rate limiting by user ID due to missing IP: ${user.id}`);
      return `ip_rate:user:${user.id}`;
    }

    this.logger.warn('Rate limiting: cannot determine IP or user identity; rejecting request');
    throw new HttpException('common.too_many_requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
