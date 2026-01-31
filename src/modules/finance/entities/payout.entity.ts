import { Column, Entity, Index, OneToMany } from 'typeorm';
import { MoneyColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Currency } from '../enums/currency.enum';
import { PayoutStatus } from '../enums/payout-status.enum';
import { Transaction } from './transaction.entity';

@Entity('payouts')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'idempotencyKey'], { unique: true })
export class Payout extends BaseTenantEntity {
  /**
   * Total payout amount.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('amount', { nullable: false })
  amount: number;

  /**
   * Commission portion of the payout.
   * Transformer ensures type safety (PostgreSQL returns strings).
   */
  @MoneyColumn('commission_amount')
  commissionAmount: number;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, string | number | boolean | null> | null;

  @Column({ name: 'payout_date', type: 'timestamptz' })
  payoutDate: Date;

  @Column({
    type: 'enum',
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => Transaction, (transaction) => transaction.payout)
  transactions: Promise<Transaction[]>;
}
