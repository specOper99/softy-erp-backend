import { IEvent } from '@nestjs/cqrs';

/**
 * FinancialReconciliationFailedEvent
 *
 * Emitted when a financial reconciliation operation fails.
 * This event enables:
 * - Prometheus metrics tracking for reconciliation failures
 * - Alert notifications (Slack, PagerDuty, etc.)
 * - Admin dashboard visibility
 * - Audit trail of failed financial operations
 * - Potential automated retry mechanisms
 */
export class FinancialReconciliationFailedEvent implements IEvent {
  constructor(
    /** ID of the booking that triggered the reconciliation */
    public readonly bookingId: string,
    /** Tenant context */
    public readonly tenantId: string,
    /** The price delta that failed to reconcile */
    public readonly priceDelta: number,
    /** Error message describing the failure */
    public readonly errorMessage: string,
    /** When the failure occurred */
    public readonly failedAt: Date,
  ) {}

  /**
   * Unique key for deduplication in retry queues
   */
  get deduplicationKey(): string {
    return `reconciliation:${this.bookingId}:${this.failedAt.getTime()}`;
  }
}
