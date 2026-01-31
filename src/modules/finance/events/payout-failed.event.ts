/**
 * Payout Failed Event
 *
 * Emitted when a payout operation fails. This is a critical financial event
 * that requires immediate attention as it affects employee payments.
 */
import { BaseFinancialEvent, EventSeverity, FinancialOperationFailedEvent } from './base-financial.event';

/**
 * Payout failure reasons
 */
export enum PayoutFailureReason {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_BANK_DETAILS = 'INVALID_BANK_DETAILS',
  PAYMENT_GATEWAY_ERROR = 'PAYMENT_GATEWAY_ERROR',
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  COMPLIANCE_HOLD = 'COMPLIANCE_HOLD',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Event emitted when a payout fails
 */
export class PayoutFailedEvent extends FinancialOperationFailedEvent {
  constructor(
    tenantId: string,
    public readonly payoutId: string,
    public readonly employeeId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly failureReason: PayoutFailureReason,
    errorMessage: string,
    correlationId?: string,
  ) {
    super(
      tenantId,
      'payout',
      payoutId,
      'payout',
      failureReason,
      errorMessage,
      failureReason === PayoutFailureReason.FRAUD_DETECTED ? EventSeverity.CRITICAL : EventSeverity.ERROR,
      correlationId,
      {
        employee_id: employeeId,
        currency,
        failure_reason: failureReason,
      },
    );
  }

  get description(): string {
    return `Payout ${this.payoutId} failed for employee ${this.employeeId}: ${this.failureReason} - ${this.errorMessage}`;
  }

  /**
   * Whether this failure is retryable
   */
  get isRetryable(): boolean {
    return [
      PayoutFailureReason.NETWORK_ERROR,
      PayoutFailureReason.RATE_LIMIT_EXCEEDED,
      PayoutFailureReason.PAYMENT_GATEWAY_ERROR,
    ].includes(this.failureReason);
  }
}

/**
 * Event emitted when a batch payout process fails
 */
export class BatchPayoutFailedEvent extends BaseFinancialEvent {
  constructor(
    tenantId: string,
    public readonly batchId: string,
    public readonly totalPayouts: number,
    public readonly failedPayouts: number,
    public readonly failedPayoutIds: string[],
    public readonly errorSummary: string,
    correlationId?: string,
  ) {
    super(
      tenantId,
      failedPayouts === totalPayouts ? EventSeverity.CRITICAL : EventSeverity.ERROR,
      'batch_payout_failed',
      correlationId,
      {
        batch_id: batchId,
        total_payouts: String(totalPayouts),
        failed_payouts: String(failedPayouts),
      },
    );
  }

  get deduplicationKey(): string {
    return `batch_payout:${this.batchId}`;
  }

  get description(): string {
    return `Batch payout ${this.batchId} failed: ${this.failedPayouts}/${this.totalPayouts} payouts failed. ${this.errorSummary}`;
  }
}
