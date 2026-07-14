import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Tenant } from '../../domain/entities/tenant.entity';

interface AuthenticatedRequest extends Request {
  user?: { tenantId?: string };
}

@Injectable()
export class TenantQuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantId = context.switchToHttp().getRequest<AuthenticatedRequest>().user?.tenantId;
    if (!tenantId) return true;

    const resourceType = this.reflector.get<string>('quotaResource', context.getHandler());
    if (!resourceType) return true;

    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['quotas'] });
    if (!tenant?.quotas) return true;

    const limit = tenant.quotas[resourceType];
    if (limit === undefined) return true;

    const currentUsage = await this.getCurrentUsage(tenantId, resourceType);
    if (currentUsage >= limit) {
      throw new ForbiddenException({ code: 'tenants.quota_exceeded', args: { resourceType, limit, currentUsage } });
    }
    return true;
  }

  private async getCurrentUsage(tenantId: string, resourceType: string): Promise<number> {
    if (resourceType === 'max_users') {
      return this.tenantRepository.manager.getRepository('User').count({ where: { tenantId } });
    }
    return 0;
  }
}
