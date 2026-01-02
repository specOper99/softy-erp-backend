import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { TransactionType } from '../../../common/enums';
import { Booking } from '../../bookings/entities/booking.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Payout } from './payout.entity';

@Entity('transactions')
@Check(
  `("booking_id" IS NOT NULL AND "task_id" IS NULL AND "payout_id" IS NULL) OR ` +
    `("booking_id" IS NULL AND "task_id" IS NOT NULL AND "payout_id" IS NULL) OR ` +
    `("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NOT NULL) OR ` +
    `("booking_id" IS NULL AND "task_id" IS NULL AND "payout_id" IS NULL)`,
)
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'transactionDate']) // Optimized for "transactions by date within tenant"
export class Transaction extends BaseTenantEntity {
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  category: string;

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

  @ManyToOne('Payout', 'transactions', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'payout_id' })
  payout: Payout | null;
}
