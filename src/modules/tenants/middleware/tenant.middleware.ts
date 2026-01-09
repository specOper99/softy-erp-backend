import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
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

  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    // Rely solely on JWT for tenant identification for authenticated requests.
    // Public routes (login/register) don't have a tenant context in the middleware
    // but handle it at the service level.
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
      const payload = this.jwtService.verify<JwtPayload>(token);

      return payload.tenantId;
    } catch {
      // Invalid signature or malformed token - ignore
      return undefined;
    }
  }
}
