import { ForbiddenException } from '@nestjs/common';
import { SubscriptionPlan } from './enums/subscription-plan.enum';

export enum PlanFeature {
  MFA_ENROLLMENT = 'MFA_ENROLLMENT',
  HR_MODULE = 'HR_MODULE',
  ANALYTICS = 'ANALYTICS',
}

const PLAN_TIER: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PRO]: 1,
  [SubscriptionPlan.ENTERPRISE]: 2,
};

/** Minimum subscription tier required for each product feature. */
const FEATURE_MIN_PLAN: Record<PlanFeature, SubscriptionPlan> = {
  [PlanFeature.MFA_ENROLLMENT]: SubscriptionPlan.FREE,
  [PlanFeature.HR_MODULE]: SubscriptionPlan.PRO,
  [PlanFeature.ANALYTICS]: SubscriptionPlan.PRO,
};

export function isPlanFeatureAvailable(plan: SubscriptionPlan, feature: PlanFeature): boolean {
  const requiredPlan = FEATURE_MIN_PLAN[feature];
  return PLAN_TIER[plan] >= PLAN_TIER[requiredPlan];
}

export function assertPlanFeature(plan: SubscriptionPlan, feature: PlanFeature): void {
  if (isPlanFeatureAvailable(plan, feature)) {
    return;
  }

  throw new ForbiddenException({
    code: 'tenants.upgrade_required',
    args: { plan: FEATURE_MIN_PLAN[feature] },
  });
}
