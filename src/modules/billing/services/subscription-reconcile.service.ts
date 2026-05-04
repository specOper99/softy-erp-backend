import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { Counter } from 'prom-client';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { Subscription, SubscriptionStatus } from '../entities/subscription.entity';
import { StripeService } from './stripe.service';

const mismatchCounter = new Counter({
  name: 'billing_reconcile_mismatch_total',
  help: 'Number of subscriptions whose local status differs from Stripe',
  labelNames: ['local_status', 'stripe_status'] as const,
});

/** Stripe → local status mapping (same as in subscription.service.ts). */
const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  paused: SubscriptionStatus.PAUSED,
};

/**
 * Daily reconciliation backstop for Stripe ↔ DB subscription state.
 *
 * See docs/billing.md for the full consistency model.
 *
 * This cron does NOT auto-correct — it only surfaces mismatches so an
 * on-call engineer can investigate before any access-control changes are applied.
 */
@Injectable()
export class SubscriptionReconcileService {
  private readonly logger = new Logger(SubscriptionReconcileService.name);
  private readonly cronExpression: string;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {
    this.cronExpression = this.configService.get<string>('BILLING_RECONCILE_CRON') ?? '0 2 * * *'; // 02:00 UTC daily
  }

  @Cron('0 2 * * *', { name: 'billing-reconcile' })
  async reconcile(): Promise<void> {
    if (!this.configService.get<string>('STRIPE_SECRET_KEY')) {
      this.logger.debug('Stripe not configured — skipping reconciliation');
      return;
    }

    this.logger.log('Starting daily Stripe reconciliation...');
    let checked = 0;
    let mismatches = 0;

    const subscriptions = await this.dataSource
      .createQueryBuilder(Subscription, 'sub')
      .where('sub.stripeSubscriptionId IS NOT NULL')
      .getMany();

    for (const sub of subscriptions) {
      await TenantContextService.run(sub.tenantId, async () => {
        try {
          const stripeObj = await this.stripeService.getSubscription(sub.stripeSubscriptionId);
          const expectedStatus = STRIPE_STATUS_MAP[stripeObj.status];

          checked++;

          if (!expectedStatus) {
            this.logger.warn(
              `Subscription ${sub.id}: unrecognised Stripe status "${stripeObj.status}" — update STRIPE_STATUS_MAP`,
            );
            return;
          }

          if (expectedStatus !== sub.status) {
            mismatches++;
            mismatchCounter.inc({ local_status: sub.status, stripe_status: expectedStatus });
            this.logger.error(
              `Subscription mismatch — tenantId=${sub.tenantId} subId=${sub.id} ` +
                `stripeId=${sub.stripeSubscriptionId}: ` +
                `DB status="${sub.status}" but Stripe reports "${expectedStatus}". ` +
                'Manual review required before correcting.',
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to reconcile subscription ${sub.id} (${sub.stripeSubscriptionId}): ${toErrorMessage(error)}`,
          );
        }
      });
    }

    this.logger.log(`Reconciliation complete: checked=${checked} mismatches=${mismatches}`);
  }
}
