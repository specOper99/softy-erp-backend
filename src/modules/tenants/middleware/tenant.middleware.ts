import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../../../common/services/tenant-context.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // 1. Try to get Tenant ID from JWT (Authenticated requests)
    const tenantId = this.extractTenantIdFromJwt(req);

    if (!tenantId) {
      return next();
    }

    TenantContextService.run(tenantId, () => {
      next();
    });
  }

  /**
   * Extracts tenantId from JWT with full verification.
   * If verification fails, returns undefined (trusted context only).
   */
  private extractTenantIdFromJwt(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    try {
      // Verify JWT signature to prevent spoofing
      // Note: We don't check expiration here necessarily, but verify() usually does by default.
      // If it's expired, verify() throws, so we won't extract tenantId, which is safer.
      const rawAlgorithms = this.configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
      const parsed = rawAlgorithms
        .split(',')
        .map((a) => a.trim().toUpperCase())
        .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

      const unique = Array.from(new Set(parsed));
      if (unique.length !== 1) {
        throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
      }
      const algorithm = unique[0] ?? 'HS256';

      if (algorithm === 'RS256') {
        const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY');
        if (!publicKey) {
          throw new Error('JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS includes RS256');
        }
        const payload = this.jwtService.verify<JwtPayload>(token, { algorithms: [algorithm], publicKey });
        return payload.tenantId;
      }

      const secret = this.configService.getOrThrow<string>('auth.jwtSecret');
      const payload = this.jwtService.verify<JwtPayload>(token, { algorithms: [algorithm], secret });

      return payload.tenantId;
    } catch (error) {
      // Invalid signature / malformed token / misconfiguration.
      // Do not log token; keep as debug to avoid log noise.
      this.logger.debug('Failed to extract tenantId from JWT', error);
      return undefined;
    }
  }
}
