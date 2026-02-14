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
@Check(
  `("booking_id" IS NOT NULL AND "task_id" IS NULL AND "payout_id" IS NULL) OR ` +
    `("booking_id" IS NULL AND "task_id" IS NOT NULL AND "payout_id" IS NULL) OR ` +
    `("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NOT NULL)`,
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

  @Column({ name: 'payout_id', type: 'uuid', nullable: true })
  payoutId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  @Index() // Frequent range queries
  transactionDate: Date;

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
}
