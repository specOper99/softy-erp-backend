import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';

export enum RecurringFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export enum RecurringStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

@Entity('recurring_transactions')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'nextRunDate'])
export class RecurringTransaction extends BaseTenantEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({ type: 'varchar', nullable: true })
  category: string;

  @Column({ type: 'varchar', nullable: true })
  department: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: RecurringFrequency,
  })
  frequency: RecurringFrequency;

  @Column({ type: 'int', default: 1 })
  interval: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ name: 'next_run_date', type: 'date' })
  nextRunDate: Date;

  @Column({ name: 'last_run_date', type: 'date', nullable: true })
  lastRunDate: Date | null;

  @Column({ name: 'run_count', type: 'int', default: 0 })
  runCount: number;

  @Column({ name: 'max_occurrences', type: 'int', nullable: true })
  maxOccurrences: number | null;

  @Column({
    type: 'enum',
    enum: RecurringStatus,
    default: RecurringStatus.ACTIVE,
  })
  status: RecurringStatus;

  @Column({ name: 'notify_before_days', type: 'int', default: 0 })
  notifyBeforeDays: number;

  @Column({ name: 'failure_count', type: 'int', default: 0 })
  failureCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | undefined;

  isComplete(): boolean {
    if (this.status === RecurringStatus.COMPLETED) return true;
    if (this.endDate && new Date() > this.endDate) return true;
    if (this.maxOccurrences && this.runCount >= this.maxOccurrences)
      return true;
    return false;
  }

  calculateNextRunDate(): Date {
    const current = this.nextRunDate || this.startDate;
    const next = new Date(current);

    switch (this.frequency) {
      case RecurringFrequency.DAILY:
        next.setDate(next.getDate() + this.interval);
        break;
      case RecurringFrequency.WEEKLY:
        next.setDate(next.getDate() + 7 * this.interval);
        break;
      case RecurringFrequency.BIWEEKLY:
        next.setDate(next.getDate() + 14 * this.interval);
        break;
      case RecurringFrequency.MONTHLY:
        next.setMonth(next.getMonth() + this.interval);
        break;
      case RecurringFrequency.QUARTERLY:
        next.setMonth(next.getMonth() + 3 * this.interval);
        break;
      case RecurringFrequency.YEARLY:
        next.setFullYear(next.getFullYear() + this.interval);
        break;
    }

    return next;
  }
}
