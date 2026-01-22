import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';

interface AuthenticatedUser {
  tenantId?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class TenantQuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const tenantId = user?.tenantId;

    if (!tenantId) {
      return true; // Or false depending on policy, but usually skip if no context
    }

    // Determine the resource being accessed/created based on route or handler
    // Ideally this guard is used with a decorator specifying the resource type
    const resourceType = this.reflector.get<string>('quotaResource', context.getHandler());

    if (!resourceType) {
      return true;
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['quotas'],
    });

    if (!tenant || !tenant.quotas) {
      return true; // No quotas set
    }

    const limit = tenant.quotas[resourceType];
    if (limit === undefined) {
      return true; // No limit for this resource
    }

    const currentUsage = await this.getCurrentUsage(tenantId, resourceType);
    if (currentUsage >= limit) {
      throw new ForbiddenException(`Quota exceeded for ${resourceType}. Limit: ${limit}, Current: ${currentUsage}`);
    }

    return true;
  }

  private async getCurrentUsage(tenantId: string, resourceType: string): Promise<number> {
    switch (resourceType) {
      case 'max_users':
        return this.tenantRepository.manager.getRepository('User').count({ where: { tenantId } });
      // Add more cases here as needed (e.g. 'max_storage')
      default:
        return 0;
    }
  }
}
