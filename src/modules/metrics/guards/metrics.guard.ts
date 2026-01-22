import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import * as crypto from 'node:crypto';

/**
 * Guard to protect the metrics endpoint with bearer token authentication.
 * In production, METRICS_TOKEN is required and requests without valid
 * Authorization headers will be rejected with 401.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const requiredToken = this.configService.get<string>('METRICS_TOKEN');
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isProduction = nodeEnv === 'production';

    // In production, METRICS_TOKEN is mandatory
    if (!requiredToken) {
      if (isProduction) {
        throw new NotFoundException();
      }
      // Allow access in non-production without token for local development
      return true;
    }

    // Validate the bearer token
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header required');
    }

    const expectedHeader = `Bearer ${requiredToken}`;
    if (!this.timingSafeEquals(authHeader, expectedHeader)) {
      throw new UnauthorizedException('Invalid metrics token');
    }

    return true;
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   */
  private timingSafeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
      // Compare against self to maintain constant time even on length mismatch
      crypto.timingSafeEqual(aBuf, aBuf);
      return false;
    }

    return crypto.timingSafeEqual(aBuf, bBuf);
  }
}
