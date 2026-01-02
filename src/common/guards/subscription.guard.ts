import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionPlan } from '../../modules/tenants/entities/tenant.entity';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { TenantContextService } from '../services/tenant-context.service';

export const SUBSCRIPTION_KEY = 'subscription_plan';
export const RequireSubscription = (plan: SubscriptionPlan) =>
  SetMetadata(SUBSCRIPTION_KEY, plan);

import { SetMetadata } from '@nestjs/common';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.getAllAndOverride<SubscriptionPlan>(
      SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlan) {
      return true;
    }

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('No tenant context found');
    }

    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    // Tier hierarchy: FREE < PRO < ENTERPRISE
    const tiers = {
      [SubscriptionPlan.FREE]: 0,
      [SubscriptionPlan.PRO]: 1,
      [SubscriptionPlan.ENTERPRISE]: 2,
    };

    const currentTier = tiers[tenant.subscriptionPlan];
    const requiredTier = tiers[requiredPlan];

    if (currentTier < requiredTier) {
      throw new ForbiddenException(
        `Upgrade to ${requiredPlan} to access this feature.`,
      );
    }

    return true;
  }
}
