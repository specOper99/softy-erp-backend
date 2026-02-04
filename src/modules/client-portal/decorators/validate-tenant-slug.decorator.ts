import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';

/**
 * Middleware to validate tenant slug from URL params and inject tenant into request
 */
@Injectable()
export class ValidateTenantSlugMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = req.params.slug as string;

    if (!slug) {
      throw new BadRequestException('Tenant slug is required');
    }

    const tenant = await this.tenantRepository.findOne({
      where: { slug: slug },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found`);
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new NotFoundException(`Tenant with slug "${slug}" is not active`);
    }

    // Inject tenant into request for downstream use
    (req as Request & { tenant?: Tenant }).tenant = tenant;

    next();
  }
}

/**
 * Decorator to extract validated tenant from request
 */
export const GetTenant = createParamDecorator((data: unknown, ctx: ExecutionContext): Tenant => {
  const request = ctx.switchToHttp().getRequest<Request & { tenant?: Tenant }>();

  if (!request.tenant) {
    throw new NotFoundException('Tenant not found in request context');
  }

  return request.tenant;
});
