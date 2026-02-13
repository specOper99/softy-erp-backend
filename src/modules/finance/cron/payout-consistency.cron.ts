import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { Gauge, register } from 'prom-client';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MockPaymentGatewayService } from '../../hr/services/payment-gateway.service';
import { TenantsService } from '../../tenants/tenants.service';
import { FINANCE } from '../constants';
import { Payout } from '../entities/payout.entity';
import { PayoutRepository } from '../repositories/payout.repository';

@Injectable()
export class PayoutConsistencyCron {
  private readonly logger = new Logger(PayoutConsistencyCron.name);
  private readonly stuckPayoutsGauge: Gauge;

  constructor(
    private readonly payoutRepository: PayoutRepository,
    private readonly paymentGateway: MockPaymentGatewayService,
    private readonly tenantsService: TenantsService,
    private readonly distributedLockService: DistributedLockService,
  ) {
    this.stuckPayoutsGauge = new Gauge({
      name: 'softy_erp_stuck_payouts',
      help: 'Number of payouts stuck in pending state for more than 10 minutes',
      registers: [register],
    });
  }

  /**
   * Monitor for stuck payouts (PENDING for > 10 minutes).
   * Runs every 10 minutes with tenant isolation.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async monitorStuckPayouts(): Promise<void> {
    // Use distributed lock to prevent concurrent runs across instances
    const result = await this.distributedLockService.withLock(
      'payout:consistency-check',
      async () => {
        const tenants = await this.tenantsService.findAll();
        let totalStuck = 0;

        const tenantLimit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);
        await Promise.allSettled(
          tenants.map((tenant) =>
            tenantLimit(async () => {
              await TenantContextService.run(tenant.id, async () => {
                const stuckPayouts = await this.findStuckPayouts();
                totalStuck += stuckPayouts.length;

                if (stuckPayouts.length > 0) {
                  this.logger.warn(
                    `Tenant ${tenant.id}: Found ${stuckPayouts.length} stuck payouts. Checking status with gateway...`,
                  );

                  const payoutLimit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);
                  await Promise.allSettled(
                    stuckPayouts.map((payout) => payoutLimit(() => this.handleStuckPayout(payout))),
                  );
                }
              });
            }),
          ),
        );

        // Update Prometheus metric with total across all tenants
        this.stuckPayoutsGauge.set(totalStuck);
        return { totalStuck };
      },
      { ttl: 60000 }, // 1 minute TTL
    );

    if (!result) {
      this.logger.debug('Skipping payout consistency check: another instance is running');
    }
  }

  private async findStuckPayouts(): Promise<Payout[]> {
    // Use tenant-scoped repository method
    return this.payoutRepository.findStuckPayouts(10, 100);
  }

  private async handleStuckPayout(payout: Payout): Promise<void> {
    const referenceId = this.getReferenceId(payout);
    if (!referenceId) {
      this.logger.error(
        `[ALERT] Payout ${payout.id} is stuck and has NO reference ID. Likely failed before gateway call.`,
      );
      return;
    }

    try {
      const gatewayStatus = await this.paymentGateway.checkPayoutStatus(referenceId);
      this.logGatewayStatus(payout, gatewayStatus.status);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to check status for payout ${payout.id}: ${message}`);
    }
  }

  private getReferenceId(payout: Payout): string | null {
    const referenceId = payout.metadata?.['referenceId'];
    if (typeof referenceId !== 'string' || referenceId.length === 0) {
      return null;
    }
    return referenceId;
  }

  private logGatewayStatus(payout: Payout, status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'NOT_FOUND'): void {
    if (status === 'COMPLETED') {
      this.logger.error(
        `[CRITICAL] Payout ${payout.id} is COMPLETED at gateway but PENDING in DB! Money left, ledger missing. Runbook: docs/runbooks/db-rollback.md`,
      );
      return;
    }

    if (status === 'FAILED') {
      this.logger.warn(
        `[INFO] Payout ${payout.id} failed at gateway. Should have been handled by relay. Safe to mark FAILED.`,
      );
      return;
    }

    this.logger.warn(`[WARN] Payout ${payout.id} is ${status} at gateway.`);
  }
}
