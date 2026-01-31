import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { TenantsService } from '../tenants.service';
import { TenantStatus } from '../enums/tenant-status.enum';

/**
 * Global guard that ensures a tenant context is present for protected routes.
 * It checks the TenantContextService (populated by TenantMiddleware) for a tenantId.
 * Certain public routes (e.g., user registration) are allowed without a tenant ID.
 * If no tenantId is found for protected routes, the request is rejected with an UnauthorizedException.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private static readonly TENANT_STATE_TTL_MS = 30_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
    private readonly cache: CacheUtilsService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) {
      return true;
    }

    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.assertTenantActiveOrAllowed(tenantId);
  }

  private async assertTenantActiveOrAllowed(tenantId: string): Promise<boolean> {
    const cacheKey = `tenant:state:${tenantId}`;
    const cached = await this.cache.get<{ status?: TenantStatus }>(cacheKey);

    const status = cached?.status ?? (await this.loadTenantStatus(tenantId));
    if (!cached?.status) {
      await this.cache.set(cacheKey, { status }, TenantGuard.TENANT_STATE_TTL_MS);
    }

    // Default: allow ACTIVE and GRACE_PERIOD; block inactive/suspended/locked/etc.
    if (status === TenantStatus.ACTIVE || status === TenantStatus.GRACE_PERIOD) {
      return true;
    }

    throw new ForbiddenException('tenants.tenant_suspended');
  }

  private async loadTenantStatus(tenantId: string): Promise<TenantStatus> {
    const tenant = await this.tenantsService.findOne(tenantId);
    return tenant.status;
  }
}
