import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ExchangeRateColumn, MoneyColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { Booking } from '../../bookings/entities/booking.entity';
import type { Task } from '../../tasks/entities/task.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import type { Payout } from './payout.entity';
import type { TransactionCategory } from './transaction-category.entity';

@Entity('transactions')
// At most one of {booking_id, task_id, payout_id} may be set; zero is allowed
// for manual, recurring, purchase-invoice, and reversal transactions.
// NOTE: purchase_invoice_id is excluded from this check constraint until its FK column is added.
// Track in: https://github.com/your-org/softy-erp/issues/XXXX (add purchase_invoice_id FK)
@Check(
  `(CASE WHEN "booking_id" IS NOT NULL THEN 1 ELSE 0 END +` +
    ` CASE WHEN "task_id"    IS NOT NULL THEN 1 ELSE 0 END +` +
    ` CASE WHEN "payout_id"  IS NOT NULL THEN 1 ELSE 0 END) <= 1`,
)
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'transactionDate']) // Optimized for "transactions by date within tenant"
@Index(['tenantId', 'department']) // Optimized for department-level budget reporting
export class Transaction extends BaseTenantEntity {
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.USD,
  })
  currency: Currency;

  /**
   * Exchange rate at time of transaction.
   * Uses 6 decimal places for precision in currency conversions.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @ExchangeRateColumn('exchange_rate')
  exchangeRate: number;

  /**
   * Transaction amount in the specified currency.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('amount', { nullable: false })
  amount: number;

  @Column({ nullable: true })
  category: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ nullable: true })
  @Index()
  department: string;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'revenue_account_code', type: 'varchar', length: 64, nullable: true })
  revenueAccountCode: string | null;

  @Column({ name: 'payout_id', type: 'uuid', nullable: true })
  payoutId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  @Index() // Frequent range queries
  transactionDate: Date;

  @Column({ name: 'payment_method', type: 'varchar', length: 50, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @ManyToOne('Booking', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking | null;

  @ManyToOne('Task', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'task_id' })
  task: Task | null;

  @ManyToOne('Payout', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'payout_id' })
  payout: Payout | null;

  @ManyToOne('TransactionCategory', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  categoryRelation: TransactionCategory | null;

  // ── Void / reversal support ──────────────────────────────────────────────

  /** ID of the original transaction this row reverses. NULL for non-reversals. */
  @Column({ name: 'reversal_of_id', type: 'uuid', nullable: true })
  reversalOfId: string | null;

  /** Timestamp at which the original transaction was voided. */
  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  /** ID of the user who performed the void action. */
  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy: string | null;

  @ManyToOne('Transaction', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reversal_of_id' })
  reversalOf: Transaction | null;
}
