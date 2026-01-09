import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Currency } from '../enums/currency.enum';
import { Transaction } from './transaction.entity';

@Entity('payouts')
@Index(['tenantId', 'id'], { unique: true })
export class Payout extends BaseTenantEntity {
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'payout_date', type: 'timestamptz' })
  payoutDate: Date;

  @Column({ default: 'COMPLETED' })
  status: string;

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
