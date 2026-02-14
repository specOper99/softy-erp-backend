import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { BookingStatus } from '../enums/booking-status.enum';

import { MoneyColumn, PercentColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { ServicePackage } from '../../catalog/entities/service-package.entity';
import type { Client } from './client.entity';

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

  @Column({ name: 'start_time', type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.DRAFT,
  })
  status: BookingStatus;

  @MoneyColumn('total_price')
  totalPrice: number;

  @MoneyColumn('sub_total')
  subTotal: number;

  @PercentColumn('tax_rate')
  taxRate: number;

  @MoneyColumn('tax_amount')
  taxAmount: number;

  @Column({ name: 'package_id' })
  @Index()
  packageId: string;

  @PercentColumn('deposit_percentage')
  depositPercentage: number;

  @MoneyColumn('deposit_amount')
  depositAmount: number;

  @MoneyColumn('amount_paid')
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

  @MoneyColumn('refund_amount')
  refundAmount: number;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @ManyToOne('Client')
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne('ServicePackage')
  @JoinColumn({ name: 'package_id' })
  servicePackage: ServicePackage;

  // ==================== Domain Methods ====================

  /**
   * Checks if the booking can be cancelled based on current status.
   */
  canBeCancelled(): boolean {
    return [BookingStatus.DRAFT, BookingStatus.CONFIRMED].includes(this.status);
  }

  /**
   * Checks if the booking can be completed (must be confirmed first).
   */
  canBeCompleted(): boolean {
    return this.status === BookingStatus.CONFIRMED;
  }

  /**
   * Checks if the booking is in a terminal state.
   */
  isTerminal(): boolean {
    return [BookingStatus.COMPLETED, BookingStatus.CANCELLED].includes(this.status);
  }

  /**
   * Calculates the remaining balance to be paid.
   */
  getRemainingBalance(): number {
    return Math.max(0, Number(this.totalPrice) - Number(this.amountPaid));
  }

  /**
   * Checks if the booking is fully paid.
   */
  isFullyPaid(): boolean {
    return Number(this.amountPaid) >= Number(this.totalPrice);
  }

  /**
   * Checks if deposit has been paid.
   */
  isDepositPaid(): boolean {
    return Number(this.amountPaid) >= Number(this.depositAmount);
  }
}
