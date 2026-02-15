import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { TransactionType } from '../enums/transaction-type.enum';

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

  @ManyToOne(() => TransactionCategory, (category: TransactionCategory) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: TransactionCategory;

  @OneToMany(() => TransactionCategory, (category: TransactionCategory) => category.parent)
  children: TransactionCategory[];
}
