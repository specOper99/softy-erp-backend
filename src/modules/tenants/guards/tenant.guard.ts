import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';

/**
 * Global guard that ensures a tenant context is present for protected routes.
 * It checks the TenantContextService (populated by TenantMiddleware) for a tenantId.
 * Certain public routes (e.g., user registration) are allowed without a tenant ID.
 * If no tenantId is found for protected routes, the request is rejected with an UnauthorizedException.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const _request = context.switchToHttp().getRequest<Request>();

    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) {
      return true;
    }

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      // No tenant information – reject the request.
      throw new UnauthorizedException('tenants.tenant_id_required');
    }
    return true;
  }
}
