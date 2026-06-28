import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { meetsMinimumPlan } from '../plan-features';
import { TenantsService } from '../tenants.service';

export const SUBSCRIPTION_KEY = 'subscription_plan';
export const RequireSubscription = (plan: SubscriptionPlan) => SetMetadata(SUBSCRIPTION_KEY, plan);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.getAllAndOverride<SubscriptionPlan>(SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPlan) return true;

    const tenantId = TenantContextService.getTenantIdOrThrow();
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) throw new ForbiddenException('tenants.not_found');

    if (!meetsMinimumPlan(tenant.subscriptionPlan, requiredPlan)) {
      throw new ForbiddenException({ code: 'tenants.upgrade_required', args: { plan: requiredPlan } });
    }
    return true;
  }
}
