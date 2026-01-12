import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { Task } from '../../tasks/entities/task.entity';
import { BookingStatus } from '../enums/booking-status.enum';

import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Invoice } from '../../finance/entities/invoice.entity';
import { Client } from './client.entity';

@Entity('bookings')
@Index(['tenantId', 'status', 'eventDate'])
@Index(['tenantId', 'clientId', 'eventDate'])
@Index(['tenantId', 'createdAt']) // Optimize default pagination
export class Booking extends BaseTenantEntity {
  @Column({ name: 'client_id' })
  @Index()
  clientId: string;

  @Column({ name: 'event_date', type: 'timestamptz' })
  eventDate: Date;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.DRAFT,
  })
  status: BookingStatus;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({
    name: 'sub_total',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  subTotal: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  taxRate: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({ name: 'package_id' })
  @Index()
  packageId: string;

  @Column({
    name: 'deposit_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  depositPercentage: number;

  @Column({
    name: 'deposit_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  depositAmount: number;

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountPaid: number;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({
    name: 'refund_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  refundAmount: number;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @ManyToOne(() => Client, (client) => client.bookings)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => ServicePackage)
  @JoinColumn({ name: 'package_id' })
  servicePackage: ServicePackage;

  @OneToMany(() => Task, (task) => task.booking)
  tasks: Promise<Task[]>;

  @OneToOne(() => Invoice, (invoice) => invoice.booking)
  invoice: Promise<Invoice>;
}
