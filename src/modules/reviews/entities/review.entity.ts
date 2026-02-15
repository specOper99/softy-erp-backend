import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { ReviewStatus } from '../enums/review-status.enum';

@Entity('reviews')
@Index(['tenantId', 'packageId', 'status'])
@Index(['tenantId', 'clientId'])
@Index(['tenantId', 'bookingId'])
@Unique(['clientId', 'bookingId'])
@Check(`rating >= 1 AND rating <= 5`)
export class Review extends BaseTenantEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text' })
  comment: string;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PENDING,
  })
  status: ReviewStatus;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @ManyToOne(() => ServicePackage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: ServicePackage;
}
