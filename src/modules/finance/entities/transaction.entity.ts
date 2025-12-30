import { Column, Entity, Index } from 'typeorm';
import { ReferenceType, TransactionType } from '../../../common/enums';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('transactions')
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

  @Index()
  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: ReferenceType,
    nullable: true,
  })
  referenceType: ReferenceType | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  transactionDate: Date;
}
