import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Gauge, register } from 'prom-client';
import { LessThan, Repository } from 'typeorm';
import { MockPaymentGatewayService } from '../../hr/services/payment-gateway.service';
import { Payout } from '../entities/payout.entity';
import { PayoutStatus } from '../enums/payout-status.enum';

@Injectable()
export class PayoutConsistencyCron {
  private readonly logger = new Logger(PayoutConsistencyCron.name);
  private readonly stuckPayoutsGauge: Gauge;

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    private readonly paymentGateway: MockPaymentGatewayService,
  ) {
    this.stuckPayoutsGauge = new Gauge({
      name: 'softy_erp_stuck_payouts',
      help: 'Number of payouts stuck in pending state for more than 10 minutes',
      registers: [register],
    });
  }

  /**
   * Monitor for stuck payouts (PENDING for > 10 minutes).
   * Runs every 10 minutes.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async monitorStuckPayouts(): Promise<void> {
    const stuckPayouts = await this.findStuckPayouts();

    // Update Prometheus metric
    this.stuckPayoutsGauge.set(stuckPayouts.length);

    if (stuckPayouts.length === 0) {
      return;
    }

    this.logger.warn(`Found ${stuckPayouts.length} stuck payouts. Checking status with gateway...`);

    for (const payout of stuckPayouts) {
      await this.handleStuckPayout(payout);
    }
  }

  private async findStuckPayouts(): Promise<Payout[]> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    return this.payoutRepository.find({
      where: {
        status: PayoutStatus.PENDING,
        payoutDate: LessThan(tenMinutesAgo),
      },
      take: 100, // Limit alerts
    });
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
