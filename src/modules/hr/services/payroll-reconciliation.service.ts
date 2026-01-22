import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Counter, Gauge } from 'prom-client';
import { LessThan, Repository } from 'typeorm';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Payout } from '../../finance/entities/payout.entity';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { TicketPriority } from '../../notifications/services/ticketing.interface';
import { TicketingService } from '../../notifications/services/ticketing.service';
import { TenantsService } from '../../tenants/tenants.service';
import { MockPaymentGatewayService } from '../services/payment-gateway.service';

interface ReconciliationResult {
  payoutId: string;
  tenantId: string;
  dbStatus: PayoutStatus;
  gatewayStatus: string;
  mismatchType: 'PENDING_BUT_COMPLETED' | 'PENDING_BUT_FAILED' | 'STATUS_SYNC';
  referenceId: string;
}

@Injectable()
export class PayrollReconciliationService {
  private readonly logger = new Logger(PayrollReconciliationService.name);
  private readonly tracer = trace.getTracer('payroll-reconciliation');

  // Prometheus metrics
  private readonly reconciliationRunsTotal: Counter<string>;
  private readonly reconciliationMismatchesTotal: Counter<string>;
  private readonly reconciliationFailuresTotal: Counter<string>;
  private readonly stalePayoutsGauge: Gauge<string>;

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    private readonly paymentGatewayService: MockPaymentGatewayService,
    private readonly ticketingService: TicketingService,
    private readonly tenantsService: TenantsService,
    private readonly distributedLockService: DistributedLockService,
    metricsFactory: MetricsFactory,
  ) {
    this.reconciliationRunsTotal = metricsFactory.getOrCreateCounter({
      name: 'chapters_payroll_reconciliation_runs_total',
      help: 'Total number of payroll reconciliation runs',
      labelNames: ['status'],
    });

    this.reconciliationMismatchesTotal = metricsFactory.getOrCreateCounter({
      name: 'chapters_payroll_reconciliation_mismatches_total',
      help: 'Total number of mismatches found during reconciliation',
      labelNames: ['mismatch_type'],
    });

    this.reconciliationFailuresTotal = metricsFactory.getOrCreateCounter({
      name: 'chapters_payroll_reconciliation_failures_total',
      help: 'Total number of reconciliation job failures',
    });

    this.stalePayoutsGauge = metricsFactory.getOrCreateGauge({
      name: 'chapters_erp_stuck_payouts',
      help: 'Number of payouts stuck in PENDING state for more than 10 minutes',
    });
  }

  /**
   * Nightly reconciliation job - runs at 2:00 AM daily.
   * Compares DB payout status with payment gateway status for stale payouts.
   */
  @Cron('0 2 * * *')
  async runNightlyReconciliation(): Promise<void> {
    // Use Redis-based distributed lock instead of unsafe PostgreSQL advisory locks
    const result = await this.distributedLockService.withLock(
      'payroll:nightly-reconciliation',
      async () => {
        const span = this.tracer.startSpan('payroll-reconciliation-job');

        try {
          span.setAttribute('job.type', 'nightly-reconciliation');
          this.logger.log('Starting nightly payroll reconciliation...');

          const tenants = await this.tenantsService.findAll();
          let totalMismatches = 0;

          for (const tenant of tenants) {
            await TenantContextService.run(tenant.id, async () => {
              const mismatches = await this.reconcileTenant(tenant.id);
              totalMismatches += mismatches.length;

              // Create tickets for mismatches
              for (const mismatch of mismatches) {
                await this.createMismatchTicket(mismatch);
              }
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('mismatches.total', totalMismatches);
          this.reconciliationRunsTotal.inc({ status: 'success' });
          this.logger.log(`Nightly reconciliation completed: ${totalMismatches} mismatches found`);
          return { totalMismatches };
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          this.reconciliationRunsTotal.inc({ status: 'failure' });
          this.reconciliationFailuresTotal.inc();
          this.logger.error('Nightly reconciliation failed', error);
          throw error;
        } finally {
          span.end();
        }
      },
      { ttl: 120000 }, // 2 minute TTL for long-running reconciliation
    );

    if (!result) {
      this.logger.debug('Skipping reconciliation: another instance is running');
    }
  }

  /**
   * Reconcile payouts for a specific tenant.
   * Finds PENDING payouts older than 24 hours and verifies their gateway status.
   */
  async reconcileTenant(tenantId: string): Promise<ReconciliationResult[]> {
    const span = this.tracer.startSpan('reconcile-tenant', {
      attributes: { 'tenant.id': tenantId },
    });

    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      // Find stale PENDING payouts
      const stalePayouts = await this.payoutRepository.find({
        where: {
          tenantId,
          status: PayoutStatus.PENDING,
          payoutDate: LessThan(cutoffDate),
        },
        order: { payoutDate: 'ASC' },
      });

      // Update stuck payouts gauge
      const stuckCount = await this.countStuckPayouts(tenantId);
      this.stalePayoutsGauge.set(stuckCount);

      span.setAttribute('stale_payouts.count', stalePayouts.length);

      if (stalePayouts.length === 0) {
        this.logger.debug(`No stale payouts found for tenant ${tenantId}`);
        return [];
      }

      this.logger.log(`Found ${stalePayouts.length} stale payouts for tenant ${tenantId}`);

      const mismatches: ReconciliationResult[] = [];

      for (const payout of stalePayouts) {
        const mismatch = await this.checkPayoutStatus(payout);
        if (mismatch) {
          mismatches.push(mismatch);
          this.reconciliationMismatchesTotal.inc({ mismatch_type: mismatch.mismatchType });
        }
      }

      span.setAttribute('mismatches.count', mismatches.length);
      return mismatches;
    } finally {
      span.end();
    }
  }

  /**
   * Check a single payout against the payment gateway.
   */
  private async checkPayoutStatus(payout: Payout): Promise<ReconciliationResult | null> {
    const metadata = payout.metadata as { referenceId?: string; userId?: string } | null;
    const referenceId = metadata?.referenceId || `PAYOUT-${payout.id}`;

    try {
      // Query gateway for actual status
      const gatewayResult = await this.paymentGatewayService.checkPayoutStatus(referenceId);
      const gatewayStatus = gatewayResult.status;

      // Determine mismatch type
      if (payout.status === PayoutStatus.PENDING) {
        if (gatewayStatus === 'COMPLETED') {
          this.logger.error(`[CRITICAL] Payout ${payout.id} is COMPLETED at gateway but PENDING in DB!`);
          return {
            payoutId: payout.id,
            tenantId: payout.tenantId,
            dbStatus: PayoutStatus.PENDING,
            gatewayStatus: 'COMPLETED',
            mismatchType: 'PENDING_BUT_COMPLETED',
            referenceId,
          };
        }

        if (gatewayStatus === 'FAILED') {
          this.logger.warn(`Payout ${payout.id} is FAILED at gateway but PENDING in DB`);
          return {
            payoutId: payout.id,
            tenantId: payout.tenantId,
            dbStatus: PayoutStatus.PENDING,
            gatewayStatus: 'FAILED',
            mismatchType: 'PENDING_BUT_FAILED',
            referenceId,
          };
        }
      }

      // No mismatch
      return null;
    } catch (error) {
      this.logger.error(`Failed to check gateway status for payout ${payout.id}`, error);
      return null;
    }
  }

  /**
   * Count payouts stuck in PENDING for more than 10 minutes.
   */
  private async countStuckPayouts(tenantId: string): Promise<number> {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - 10);

    return this.payoutRepository.count({
      where: {
        tenantId,
        status: PayoutStatus.PENDING,
        payoutDate: LessThan(cutoff),
      },
    });
  }

  /**
   * Create a ticket for a reconciliation mismatch.
   */
  private async createMismatchTicket(mismatch: ReconciliationResult): Promise<void> {
    const priority = mismatch.mismatchType === 'PENDING_BUT_COMPLETED' ? TicketPriority.CRITICAL : TicketPriority.HIGH;

    await this.ticketingService.createTicket({
      title: `[Payroll Reconciliation] ${mismatch.mismatchType} - Payout ${mismatch.payoutId}`,
      description: `
## Reconciliation Mismatch Detected

**Payout ID**: ${mismatch.payoutId}
**Tenant ID**: ${mismatch.tenantId}
**Reference ID**: ${mismatch.referenceId}
**Database Status**: ${mismatch.dbStatus}
**Gateway Status**: ${mismatch.gatewayStatus}

### Mismatch Type
${mismatch.mismatchType === 'PENDING_BUT_COMPLETED' ? '⚠️ **CRITICAL**: Money has left the account but the ERP ledger has not been updated!' : '⚠️ Gateway reports payment failed but our DB shows PENDING.'}

### Remediation Steps
1. Follow the [Payroll Reconciliation Runbook](https://docs.chapters-studio.com/runbooks/payroll-reconciliation)
2. Verify gateway status manually
3. Update database and/or refund wallet as appropriate
      `.trim(),
      priority,
      labels: ['payroll', 'reconciliation', 'automated', mismatch.mismatchType.toLowerCase()],
      metadata: {
        payoutId: mismatch.payoutId,
        tenantId: mismatch.tenantId,
        referenceId: mismatch.referenceId,
        dbStatus: mismatch.dbStatus,
        gatewayStatus: mismatch.gatewayStatus,
      },
    });
  }
}
