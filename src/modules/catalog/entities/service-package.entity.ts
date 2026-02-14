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

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_template', default: false })
  isTemplate: boolean;

  @Column({ name: 'template_category', type: 'varchar', nullable: true })
  templateCategory: string | null;

  packageItems?: PackageItem[];
}
