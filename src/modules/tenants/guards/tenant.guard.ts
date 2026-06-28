import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { TenantStatus } from '../enums/tenant-status.enum';
import { TenantsService } from '../tenants.service';

@Injectable()
export class TenantGuard implements CanActivate {
  private static readonly TENANT_STATE_TTL_MS = 30_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
    private readonly cache: CacheUtilsService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) throw new UnauthorizedException('common.tenant_missing');
    return this.assertTenantActiveOrAllowed(tenantId);
  }

  private async assertTenantActiveOrAllowed(tenantId: string): Promise<boolean> {
    const cacheKey = `tenant:state:${tenantId}`;
    const cached = await this.cache.get<{ status?: TenantStatus }>(cacheKey);

    const status = cached?.status ?? (await this.loadTenantStatus(tenantId));
    if (!cached?.status) await this.cache.set(cacheKey, { status }, TenantGuard.TENANT_STATE_TTL_MS);

    if (status === TenantStatus.ACTIVE || status === TenantStatus.GRACE_PERIOD) return true;
    throw new ForbiddenException('tenants.tenant_suspended');
  }

  private async loadTenantStatus(tenantId: string): Promise<TenantStatus> {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) throw new ForbiddenException('tenants.tenant_suspended');
    return tenant.status;
  }
}
