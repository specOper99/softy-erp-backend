import { Injectable, Logger, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { domainToASCII } from 'node:url';
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
  private readonly tenantSlugCacheTtlMs = 5 * 60 * 1000;
  private readonly tenantSlugCacheMaxEntries = 10000;
  // Cache negative UUID resolutions briefly to reduce DB load from random UUID hostnames.
  // Keep this short to avoid delaying newly-created tenants.
  private readonly tenantSlugCacheNegativeUuidTtlMs = 5 * 1000;
  private readonly tenantSlugCachePurgeIntervalMs = 60 * 1000;
  private tenantSlugCacheLastPurgeAtMs = 0;

  private readonly tenantSlugCache = new LRUCache<string, string | false>({
    max: this.tenantSlugCacheMaxEntries,
    ttl: this.tenantSlugCacheTtlMs,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });

  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    // 1. Try to get Tenant ID from JWT (Authenticated requests)
    const tenantIdFromJwt = this.extractTenantIdFromJwt(req);

    // SECURITY: If a Bearer token is present but tenantId cannot be extracted, do NOT fall back to host-based resolution.
    // This prevents Host header tenant spoofing when JWT verification fails or when tenantId is missing.
    if (authHeader?.startsWith('Bearer ') && !tenantIdFromJwt) {
      return next();
    }

    // SECURITY: If both a JWT tenantId and a host-derived tenant are present, they MUST match.
    // This prevents "tenant confusion" where an attacker mixes a valid token with a different tenant host.
    if (tenantIdFromJwt) {
      const tenantKeyFromHost = this.extractTenantKeyFromHost(req.hostname);
      if (tenantKeyFromHost) {
        const tenantIdFromHost = await this.resolveTenantIdForKeyCached(tenantKeyFromHost);
        if (tenantIdFromHost && tenantIdFromHost !== tenantIdFromJwt) {
          return next(new UnauthorizedException('tenants.tenant_mismatch'));
        }
      }
    }

    // 2. [C-03] Fallback: Tenant Subdomain Extraction (for public routes like client portal)
    let tenantId = tenantIdFromJwt;
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
      .map((d) => this.normalizeHostname(d))
      .filter((d): d is string => Boolean(d));
  }

  private isAllowedHost(hostname: string, allowedDomains: string[]): boolean {
    const normalizedHost = this.normalizeHostname(hostname);
    if (!normalizedHost) {
      return false;
    }
    if (allowedDomains.length === 0) {
      return this.configService.get<string>('NODE_ENV') !== 'production';
    }
    return allowedDomains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
  }

  private normalizeHostname(value: string): string | undefined {
    const trimmed = value.trim().replace(/\.$/, '').toLowerCase();
    if (!trimmed) {
      return undefined;
    }
    const ascii = domainToASCII(trimmed);
    if (!ascii) {
      return undefined;
    }
    return ascii;
  }

  private async resolveTenantFromHost(hostname: string): Promise<string | undefined> {
    const normalizedHostname = this.normalizeHostname(hostname);
    if (!normalizedHostname) {
      return undefined;
    }

    const allowedDomains = this.getAllowedDomains();
    if (!this.isAllowedHost(normalizedHostname, allowedDomains)) {
      this.logger.warn(`Tenant resolution skipped for unapproved host: ${normalizedHostname}`);
      return undefined;
    }

    const parts = normalizedHostname.split('.');
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

  private extractTenantKeyFromHost(hostname: string): string | undefined {
    const normalizedHostname = this.normalizeHostname(hostname);
    if (!normalizedHostname) {
      return undefined;
    }

    const allowedDomains = this.getAllowedDomains();
    if (!this.isAllowedHost(normalizedHostname, allowedDomains)) {
      return undefined;
    }

    const parts = normalizedHostname.split('.');
    // Expecting: tenantId.domain.com (3+ parts)
    if (parts.length < 3) {
      return undefined;
    }

    const potentialId = parts[0];
    if (!potentialId || ['www', 'api', 'app'].includes(potentialId)) {
      return undefined;
    }

    return potentialId;
  }

  private async resolveTenantIdForKeyCached(tenantKey: string): Promise<string | undefined> {
    const now = Date.now();
    this.purgeTenantSlugCacheIfNeeded(now);

    const cached = this.tenantSlugCache.get(tenantKey);
    if (cached === false) {
      return undefined;
    }
    if (typeof cached === 'string') {
      return cached;
    }

    if (isUuid(tenantKey)) {
      try {
        const tenant = await this.tenantsService.findOne(tenantKey);
        this.tenantSlugCache.set(tenantKey, tenant.id);
        return tenant.id;
      } catch (error) {
        // Cache negative UUID resolutions briefly to reduce DB load from random UUID hostnames.
        this.tenantSlugCache.set(tenantKey, false, { ttl: this.tenantSlugCacheNegativeUuidTtlMs });
        this.logger.debug(`Failed to resolve tenant id ${tenantKey}`, error);
        return undefined;
      }
    }

    try {
      const tenant = await this.tenantsService.findBySlug(tenantKey);
      this.tenantSlugCache.set(tenantKey, tenant.id);
      return tenant.id;
    } catch (error) {
      this.logger.debug(`Failed to resolve tenant slug ${tenantKey}`, error);
      return undefined;
    }
  }

  private purgeTenantSlugCacheIfNeeded(now: number): void {
    if (now - this.tenantSlugCacheLastPurgeAtMs < this.tenantSlugCachePurgeIntervalMs) {
      return;
    }
    this.tenantSlugCache.purgeStale();
    this.tenantSlugCacheLastPurgeAtMs = now;
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
