import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // 1. Try to get Tenant ID from JWT (Authenticated requests)
    let tenantId = this.extractTenantIdFromJwt(req);

    // 2. [C-03] Fallback: Tenant Subdomain Extraction (for public routes like client portal)
    if (!tenantId) {
      tenantId = await this.resolveTenantFromHost(req.hostname);
    }

    if (!tenantId) {
      return next();
    }

    TenantContextService.run(tenantId, () => {
      next();
    });
  }

  private getAllowedDomains(): string[] {
    return this.configService
      .get<string>('TENANT_ALLOWED_DOMAINS', '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  private isAllowedHost(hostname: string, allowedDomains: string[]): boolean {
    if (allowedDomains.length === 0) {
      return true;
    }
    return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  }

  private async resolveTenantFromHost(hostname: string): Promise<string | undefined> {
    const allowedDomains = this.getAllowedDomains();
    if (!this.isAllowedHost(hostname, allowedDomains)) {
      this.logger.warn(`Tenant resolution skipped for unapproved host: ${hostname}`);
      return undefined;
    }

    const parts = hostname.split('.');
    // Expecting: tenantId.domain.com (3+ parts)
    if (parts.length < 3) {
      return undefined;
    }

    const potentialId = parts[0];
    if (['www', 'api', 'app'].includes(potentialId)) {
      return undefined;
    }

    if (isUuid(potentialId)) {
      return potentialId;
    }

    try {
      const tenant = await this.tenantsService.findBySlug(potentialId);
      return tenant.id;
    } catch (error) {
      this.logger.debug(`Failed to resolve tenant slug ${potentialId}`, error);
      return undefined;
    }
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
