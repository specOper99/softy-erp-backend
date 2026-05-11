import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';

@Entity('processing_types')
@Index(['tenantId', 'name'], { unique: true })
export class ProcessingType extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price: number;

  @Column({
    name: 'default_commission_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  defaultCommissionAmount: number;
}
