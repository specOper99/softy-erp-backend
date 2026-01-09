import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { Transaction } from './transaction.entity';

@Entity('transaction_categories')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'name'], { unique: true })
export class TransactionCategory extends BaseTenantEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    nullable: true,
  })
  applicableType: TransactionType | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string;

  @ManyToOne(() => TransactionCategory, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: TransactionCategory;

  @OneToMany(() => TransactionCategory, (category) => category.parent)
  children: Promise<TransactionCategory[]>;

  @OneToMany(() => Transaction, (transaction) => transaction.categoryRelation)
  transactions: Promise<Transaction[]>;
}
