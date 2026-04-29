import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Counter } from 'prom-client';
import { MetricsFactory } from '../../../../common/services/metrics.factory';
import { FinancialReconciliationFailedEvent } from '../financial-reconciliation-failed.event';

@EventsHandler(FinancialReconciliationFailedEvent)
export class ReconciliationFailedHandler implements IEventHandler<FinancialReconciliationFailedEvent> {
  private readonly logger = new Logger(ReconciliationFailedHandler.name);
  private readonly reconciliationFailuresTotal: Counter<string>;

  constructor(private readonly metricsFactory: MetricsFactory) {
    this.reconciliationFailuresTotal = metricsFactory.getOrCreateCounter({
      name: 'softy_finance_reconciliation_failures_total',
      help: 'Total number of financial reconciliation failures',
      labelNames: ['tenant_id'],
    });
  }

  handle(event: FinancialReconciliationFailedEvent): void {
    this.logger.error(
      `Financial reconciliation failed for booking ${event.bookingId} in tenant ${event.tenantId}: ${event.errorMessage}`,
      { bookingId: event.bookingId, tenantId: event.tenantId, priceDelta: event.priceDelta, failedAt: event.failedAt },
    );

    this.reconciliationFailuresTotal.inc({ tenant_id: event.tenantId });
  }
}
