import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { validate as isUuid } from 'uuid';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TenantsService } from '../tenants.service';

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
    private readonly tenantsService: TenantsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // 1. Try to get Tenant ID from JWT (Authenticated requests)
    let tenantId = this.extractTenantIdFromJwt(req);

    // 2. [C-03] Fallback: Tenant Subdomain Extraction (for public routes like client portal)
    if (!tenantId) {
      const hostname = req.hostname;
      const parts = hostname.split('.');
      // Expecting: tenantId.domain.com (3+ parts)
      if (parts.length >= 3) {
        const potentialId = parts[0];
        // Optional: Filter out 'www', 'api' if they are reserved subdomains
        if (!['www', 'api', 'app'].includes(potentialId)) {
          if (isUuid(potentialId)) {
            tenantId = potentialId;
          } else {
            // Resolve slug to UUID
            try {
              const tenant = await this.tenantsService.findBySlug(potentialId);
              tenantId = tenant.id;
            } catch (error) {
              // Tenant not found or DB error, ignore
              this.logger.debug(`Failed to resolve tenant slug ${potentialId}`, error);
            }
          }
        }
      }
    }

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
