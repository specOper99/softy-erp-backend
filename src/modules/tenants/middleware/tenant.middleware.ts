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
    if (!potentialId || ['www', 'api', 'app'].includes(potentialId)) {
      return undefined;
    }

    if (isUuid(potentialId)) {
      try {
        const tenant = await this.tenantsService.findOne(potentialId);
        return tenant.id;
      } catch (error) {
        this.logger.debug(`Failed to resolve tenant id ${potentialId}`, error);
        return undefined;
      }
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
      const allowedAlgorithms = (process.env.JWT_ALLOWED_ALGORITHMS || 'HS256')
        .split(',')
        .map((a) => a.trim().toUpperCase())
        .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

      const secretOrKey = (() => {
        if (allowedAlgorithms.includes('RS256')) {
          const publicKey = process.env.JWT_PUBLIC_KEY;
          if (!publicKey) {
            throw new Error('JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS includes RS256');
          }
          return publicKey;
        }

        return this.configService.getOrThrow<string>('auth.jwtSecret');
      })();

      const payload = this.jwtService.verify<JwtPayload>(token, { algorithms: allowedAlgorithms, secret: secretOrKey });

      return payload.tenantId;
    } catch (error) {
      // Invalid signature / malformed token / misconfiguration.
      // Do not log token; keep as debug to avoid log noise.
      this.logger.debug('Failed to extract tenantId from JWT', error);
      return undefined;
    }
  }
}
