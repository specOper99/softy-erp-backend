import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../services/tenant-context.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction) {
    // 1. Try to get tenantId from Header (for unauthenticated requests like login)
    const tenantIdHeader = req.headers['x-tenant-id'] as string;

    // 2. Try to extract tenantId from JWT (preferred for authenticated requests)
    const tenantIdFromJwt = this.extractTenantIdFromJwt(req);

    // Priority: JWT tenantId > Header tenantId (JWT is more secure, prevents spoofing)
    // For authenticated requests, JWT should be the source of truth
    const tenantId = tenantIdFromJwt || tenantIdHeader;

    if (!tenantId) {
      // No tenant context - allow for public routes (register, health checks)
      // Protected routes will enforce tenant via guards
      return next();
    }

    // Log warning if header differs from JWT (potential spoofing attempt)
    if (
      tenantIdHeader &&
      tenantIdFromJwt &&
      tenantIdHeader !== tenantIdFromJwt
    ) {
      this.logger.warn(
        `Tenant ID mismatch: header=${tenantIdHeader}, jwt=${tenantIdFromJwt}. Using JWT.`,
      );
    }

    TenantContextService.run(tenantId, () => {
      next();
    });
  }

  /**
   * Extracts tenantId from JWT without full verification.
   * The AuthGuard will perform full JWT verification later.
   * This is safe because we only read metadata - no authorization decision is made here.
   */
  private extractTenantIdFromJwt(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    try {
      // Decode JWT without verification (base64 decode the payload)
      const parts = token.split('.');
      if (parts.length !== 3) {
        return undefined;
      }

      const payloadBase64 = parts[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString(
        'utf8',
      );
      const payload = JSON.parse(payloadJson) as JwtPayload;

      return payload.tenantId;
    } catch {
      // Invalid JWT format - ignore, let AuthGuard handle
      return undefined;
    }
  }
}
