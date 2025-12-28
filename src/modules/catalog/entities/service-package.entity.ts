import { Column, Entity, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { PackageItem } from './package-item.entity';

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

  @OneToMany(() => PackageItem, (item) => item.servicePackage)
  packageItems: PackageItem[];

  @OneToMany(() => Booking, (booking) => booking.servicePackage)
  bookings: Booking[];
}
