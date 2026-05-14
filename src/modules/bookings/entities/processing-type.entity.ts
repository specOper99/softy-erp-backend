import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { ServicePackage } from '../../catalog/entities/service-package.entity';

@Entity('processing_types')
@Index(['tenantId', 'packageId', 'name'], { unique: true })
@Index(['tenantId', 'packageId', 'isActive', 'sortOrder'])
export class ProcessingType extends BaseTenantEntity {
  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

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

  @ManyToOne('ServicePackage')
  @JoinColumn({ name: 'package_id' })
  servicePackage: ServicePackage;
}
