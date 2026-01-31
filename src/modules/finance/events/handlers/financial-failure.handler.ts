/**
 * Financial Failure Event Handler
 *
 * Handles financial failure events by:
 * - Recording Prometheus metrics
 * - Logging structured error information
 * - Triggering alerts based on severity
 *
 * This handler ensures all financial failures are properly tracked
 * for observability and incident response.
 */
import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Counter, Histogram } from 'prom-client';
import { EventSeverity } from '../base-financial.event';
import { FinancialReconciliationFailedEvent } from '../financial-reconciliation-failed.event';
import { BatchPayoutFailedEvent, PayoutFailedEvent } from '../payout-failed.event';
import { TransactionFailedEvent } from '../transaction-failed.event';

/**
 * Prometheus metrics for financial failures
 */
const financialFailureCounter = new Counter({
  name: 'finance_operation_failures_total',
  help: 'Total count of financial operation failures',
  labelNames: ['tenant_id', 'operation_type', 'error_code', 'severity'],
});

const financialFailureByTypeCounter = new Counter({
  name: 'finance_failure_by_type_total',
  help: 'Financial failures broken down by type',
  labelNames: ['tenant_id', 'event_type'],
});

const payoutFailureAmountHistogram = new Histogram({
  name: 'finance_payout_failure_amount',
  help: 'Distribution of payout amounts that failed',
  labelNames: ['tenant_id', 'failure_reason', 'currency'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000],
});

/**
 * Handler for PayoutFailedEvent
 */
@EventsHandler(PayoutFailedEvent)
export class PayoutFailedHandler implements IEventHandler<PayoutFailedEvent> {
  private readonly logger = new Logger(PayoutFailedHandler.name);

  async handle(event: PayoutFailedEvent): Promise<void> {
    // Record metrics
    financialFailureCounter.inc({
      tenant_id: event.metadata.tenantId,
      operation_type: 'payout',
      error_code: event.failureReason,
      severity: event.metadata.severity,
    });

    financialFailureByTypeCounter.inc({
      tenant_id: event.metadata.tenantId,
      event_type: 'payout_failed',
    });

    payoutFailureAmountHistogram.observe(
      {
        tenant_id: event.metadata.tenantId,
        failure_reason: event.failureReason,
        currency: event.currency,
      },
      event.amount,
    );

    // Structured logging
    this.logger.error({
      message: event.description,
      eventId: event.metadata.eventId,
      correlationId: event.metadata.correlationId,
      tenantId: event.metadata.tenantId,
      payoutId: event.payoutId,
      employeeId: event.employeeId,
      amount: event.amount,
      currency: event.currency,
      failureReason: event.failureReason,
      isRetryable: event.isRetryable,
      severity: event.metadata.severity,
      occurredAt: event.metadata.occurredAt.toISOString(),
    });

    // Critical severity requires immediate alert
    if (event.metadata.severity === EventSeverity.CRITICAL) {
      await this.triggerCriticalAlert(event);
    }
  }

  private async triggerCriticalAlert(event: PayoutFailedEvent): Promise<void> {
    // TODO: Integrate with alerting system (PagerDuty, Slack, etc.)
    this.logger.warn({
      message: 'CRITICAL ALERT: Payout failure requires immediate attention',
      eventId: event.metadata.eventId,
      description: event.description,
      deduplicationKey: event.deduplicationKey,
    });
  }
}

/**
 * Handler for BatchPayoutFailedEvent
 */
@EventsHandler(BatchPayoutFailedEvent)
export class BatchPayoutFailedHandler implements IEventHandler<BatchPayoutFailedEvent> {
  private readonly logger = new Logger(BatchPayoutFailedHandler.name);

  async handle(event: BatchPayoutFailedEvent): Promise<void> {
    financialFailureByTypeCounter.inc({
      tenant_id: event.metadata.tenantId,
      event_type: 'batch_payout_failed',
    });

    this.logger.error({
      message: event.description,
      eventId: event.metadata.eventId,
      correlationId: event.metadata.correlationId,
      tenantId: event.metadata.tenantId,
      batchId: event.batchId,
      totalPayouts: event.totalPayouts,
      failedPayouts: event.failedPayouts,
      failedPayoutIds: event.failedPayoutIds,
      errorSummary: event.errorSummary,
      severity: event.metadata.severity,
    });

    if (event.metadata.severity === EventSeverity.CRITICAL) {
      this.logger.warn({
        message: 'CRITICAL ALERT: Batch payout completely failed',
        batchId: event.batchId,
        deduplicationKey: event.deduplicationKey,
      });
    }
  }
}

/**
 * Handler for TransactionFailedEvent
 */
@EventsHandler(TransactionFailedEvent)
export class TransactionFailedHandler implements IEventHandler<TransactionFailedEvent> {
  private readonly logger = new Logger(TransactionFailedHandler.name);

  async handle(event: TransactionFailedEvent): Promise<void> {
    financialFailureCounter.inc({
      tenant_id: event.metadata.tenantId,
      operation_type: 'transaction',
      error_code: event.failureReason,
      severity: event.metadata.severity,
    });

    financialFailureByTypeCounter.inc({
      tenant_id: event.metadata.tenantId,
      event_type: 'transaction_failed',
    });

    this.logger.error({
      message: event.description,
      eventId: event.metadata.eventId,
      correlationId: event.metadata.correlationId,
      tenantId: event.metadata.tenantId,
      transactionId: event.transactionId,
      transactionType: event.transactionType,
      amount: event.amount,
      currency: event.currency,
      failureReason: event.failureReason,
      sourceEntityId: event.sourceEntityId,
      sourceEntityType: event.sourceEntityType,
      severity: event.metadata.severity,
    });
  }
}

/**
 * Handler for FinancialReconciliationFailedEvent (legacy support)
 */
@EventsHandler(FinancialReconciliationFailedEvent)
export class ReconciliationFailedHandler implements IEventHandler<FinancialReconciliationFailedEvent> {
  private readonly logger = new Logger(ReconciliationFailedHandler.name);

  async handle(event: FinancialReconciliationFailedEvent): Promise<void> {
    financialFailureByTypeCounter.inc({
      tenant_id: event.tenantId,
      event_type: 'reconciliation_failed',
    });

    this.logger.error({
      message: `Reconciliation failed for booking ${event.bookingId}`,
      tenantId: event.tenantId,
      bookingId: event.bookingId,
      priceDelta: event.priceDelta,
      errorMessage: event.errorMessage,
      failedAt: event.failedAt.toISOString(),
      deduplicationKey: event.deduplicationKey,
    });
  }
}

/**
 * Export all handlers for module registration
 */
export const FinancialFailureHandlers = [
  PayoutFailedHandler,
  BatchPayoutFailedHandler,
  TransactionFailedHandler,
  ReconciliationFailedHandler,
];
