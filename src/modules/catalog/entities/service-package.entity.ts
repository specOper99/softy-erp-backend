import { Column, Entity } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { PackageItem } from './package-item.entity';

@Entity('service_packages')
export class ServicePackage extends BaseTenantEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ name: 'duration_minutes', type: 'int', default: 60 })
  durationMinutes: number;

  @Column({ name: 'required_staff_count', type: 'int', default: 1 })
  requiredStaffCount: number;

  @Column({ name: 'revenue_account_code', type: 'varchar', length: 64, default: 'SERVICES' })
  revenueAccountCode: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_template', default: false })
  isTemplate: boolean;

  @Column({ name: 'template_category', type: 'varchar', nullable: true })
  templateCategory: string | null;

  packageItems?: PackageItem[];
}
