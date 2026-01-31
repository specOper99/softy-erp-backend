import { IEvent } from '@nestjs/cqrs';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';

/**
 * Event fired when a new transaction is created.
 * This event triggers:
 * - Dashboard revenue metrics updates
 * - Financial report cache invalidation
 * - Webhook notifications to external accounting systems
 * - Analytics tracking for financial trends
 */
export class TransactionCreatedEvent implements IEvent {
  constructor(
    public readonly transactionId: string,
    public readonly tenantId: string,
    public readonly type: TransactionType,
    public readonly amount: number,
    public readonly currency: Currency,
    public readonly exchangeRate: number,
    public readonly category: string | undefined,
    public readonly bookingId: string | undefined,
    public readonly taskId: string | undefined,
    public readonly payoutId: string | undefined,
    public readonly description: string | undefined,
    public readonly transactionDate: Date,
    public readonly createdAt: Date,
  ) {}

  /**
   * Get the amount in base currency (after exchange rate conversion)
   */
  get baseAmount(): number {
    return this.amount * this.exchangeRate;
  }
}
