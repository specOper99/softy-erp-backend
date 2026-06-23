import { ForbiddenException } from '@nestjs/common';
import { SubscriptionPlan } from './enums/subscription-plan.enum';
import { assertPlanFeature, isPlanFeatureAvailable, PlanFeature } from './plan-features';

describe('plan-features', () => {
  describe('isPlanFeatureAvailable', () => {
    it('allows MFA enrollment on all tiers', () => {
      expect(isPlanFeatureAvailable(SubscriptionPlan.FREE, PlanFeature.MFA_ENROLLMENT)).toBe(true);
      expect(isPlanFeatureAvailable(SubscriptionPlan.PRO, PlanFeature.MFA_ENROLLMENT)).toBe(true);
      expect(isPlanFeatureAvailable(SubscriptionPlan.ENTERPRISE, PlanFeature.MFA_ENROLLMENT)).toBe(true);
    });

    it('gates HR and analytics to PRO+', () => {
      expect(isPlanFeatureAvailable(SubscriptionPlan.FREE, PlanFeature.HR_MODULE)).toBe(false);
      expect(isPlanFeatureAvailable(SubscriptionPlan.PRO, PlanFeature.HR_MODULE)).toBe(true);
      expect(isPlanFeatureAvailable(SubscriptionPlan.FREE, PlanFeature.ANALYTICS)).toBe(false);
      expect(isPlanFeatureAvailable(SubscriptionPlan.ENTERPRISE, PlanFeature.ANALYTICS)).toBe(true);
    });
  });

  describe('assertPlanFeature', () => {
    it('does not throw when MFA is available on FREE', () => {
      expect(() => assertPlanFeature(SubscriptionPlan.FREE, PlanFeature.MFA_ENROLLMENT)).not.toThrow();
    });

    it('throws upgrade_required when HR is requested on FREE', () => {
      expect(() => assertPlanFeature(SubscriptionPlan.FREE, PlanFeature.HR_MODULE)).toThrow(ForbiddenException);
      try {
        assertPlanFeature(SubscriptionPlan.FREE, PlanFeature.HR_MODULE);
      } catch (error) {
        const response = (error as ForbiddenException).getResponse() as { code: string; args: { plan: string } };
        expect(response.code).toBe('tenants.upgrade_required');
        expect(response.args.plan).toBe(SubscriptionPlan.PRO);
      }
    });
  });
});
