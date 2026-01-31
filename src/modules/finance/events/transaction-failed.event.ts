/**
 * Transaction Failed Event
 *
 * Emitted when a financial transaction creation or processing fails.
 */
import { EventSeverity, FinancialOperationFailedEvent } from './base-financial.event';

/**
 * Transaction failure reasons
 */
export enum TransactionFailureReason {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_CURRENCY = 'INVALID_CURRENCY',
  ACCOUNT_FROZEN = 'ACCOUNT_FROZEN',
  COMPLIANCE_REJECTION = 'COMPLIANCE_REJECTION',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Event emitted when a transaction fails
 */
export class TransactionFailedEvent extends FinancialOperationFailedEvent {
  constructor(
    tenantId: string,
    public readonly transactionId: string | null,
    public readonly transactionType: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly failureReason: TransactionFailureReason,
    errorMessage: string,
    public readonly sourceEntityId?: string,
    public readonly sourceEntityType?: string,
    correlationId?: string,
  ) {
    super(
      tenantId,
      'transaction',
      transactionId || 'pending',
      'transaction',
      failureReason,
      errorMessage,
      failureReason === TransactionFailureReason.COMPLIANCE_REJECTION ? EventSeverity.CRITICAL : EventSeverity.ERROR,
      correlationId,
      {
        transaction_type: transactionType,
        currency,
        failure_reason: failureReason,
        ...(sourceEntityType && { source_entity_type: sourceEntityType }),
      },
    );
  }

  get description(): string {
    const txnRef = this.transactionId || 'new transaction';
    return `Transaction ${txnRef} (${this.transactionType}) failed: ${this.failureReason} - ${this.errorMessage}`;
  }
}
