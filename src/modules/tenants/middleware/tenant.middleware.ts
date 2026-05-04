import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { RuntimeFailure } from '../../../common/errors/runtime-failure';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { getAllowedJwtAlgorithm } from '../../../common/utils/jwt-algorithm.util';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
  aud?: string;
}

interface ExtractedContext {
  tenantId: string;
  userId: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // 1. Try to get Tenant ID and User ID from JWT (Authenticated requests)
    const ctx = this.extractContextFromJwt(req);

    if (!ctx) {
      return next();
    }

    TenantContextService.runWithUser(ctx.tenantId, ctx.userId, () => {
      next();
    });
  }

  /**
   * Extracts tenantId from JWT with full verification.
   * If verification fails, returns undefined (trusted context only).
   */
  private extractContextFromJwt(req: Request): ExtractedContext | undefined {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    try {
      // Verify JWT signature to prevent spoofing
      // Note: We don't check expiration here necessarily, but verify() usually does by default.
      // If it's expired, verify() throws, so we won't extract tenantId, which is safer.
      const algorithm = getAllowedJwtAlgorithm(this.configService);

      let payload: JwtPayload;

      if (algorithm === 'RS256') {
        const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY');
        if (!publicKey) {
          throw new RuntimeFailure('JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS includes RS256');
        }
        payload = this.jwtService.verify<JwtPayload>(token, { algorithms: [algorithm], publicKey });
      } else {
        const secret = this.configService.getOrThrow<string>('auth.jwtSecret');
        payload = this.jwtService.verify<JwtPayload>(token, { algorithms: [algorithm], secret });
      }

      // Validate aud claim: access tokens carry the tenantId as audience.
      if (payload.tenantId && payload.aud && payload.aud !== payload.tenantId) {
        this.logger.debug('JWT aud mismatch — rejecting token');
        return undefined;
      }

      if (!payload.tenantId || !payload.sub) {
        return undefined;
      }

      return { tenantId: payload.tenantId, userId: payload.sub };
    } catch (error) {
      // Invalid signature / malformed token / misconfiguration.
      // Do not log token; keep as debug to avoid log noise.
      this.logger.debug('Failed to extract context from JWT', error);
      return undefined;
    }
  }
}
