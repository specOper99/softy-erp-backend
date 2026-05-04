import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';

/**
 * Middleware to validate tenant slug from URL params and inject tenant into request.
 * Uses TenantsService.ensurePortalTenantAccessible() so that the error contract and
 * feature-flag behaviour (strictPortalTenantStatus) are identical to those used by
 * ClientTokenGuard and the controller's resolveTenant() helper.
 */
@Injectable()
export class ValidateTenantSlugMiddleware implements NestMiddleware {
  constructor(private readonly tenantsService: TenantsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = req.params.slug as string;

    if (!slug) {
      throw new BadRequestException('client_portal.tenant_slug_required_body');
    }

    const tenant = await this.tenantsService.findBySlug(slug);

    this.tenantsService.ensurePortalTenantAccessible(tenant, {
      guard: 'ValidateTenantSlugMiddleware',
      tenantSlug: slug,
    });

    // Inject tenant into request for downstream use
    (req as Request & { tenant?: Tenant }).tenant = tenant;

    next();
  }
}

/**
 * Decorator to extract validated tenant from request
 */
export const GetTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): Tenant => {
  const request = ctx.switchToHttp().getRequest<Request & { tenant?: Tenant }>();

  if (!request.tenant) {
    throw new BadRequestException('client-portal.tenant_blocked');
  }

  return request.tenant;
});
