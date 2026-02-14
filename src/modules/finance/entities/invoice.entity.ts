import Decimal from 'decimal.js';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { MoneyColumn, PercentColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { Booking } from '../../bookings/entities/booking.entity';
import type { Client } from '../../bookings/entities/client.entity';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  VOID = 'VOID',
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
}

@Entity('invoices')
@Index(['tenantId', 'invoiceNumber'], { unique: true })
@Index(['tenantId', 'bookingId'], { unique: true })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'dueDate'])
@Index(['tenantId', 'clientId'])
export class Invoice extends BaseTenantEntity {
  @Column({ name: 'invoice_number' })
  invoiceNumber: string;

  @Column({ name: 'booking_id', nullable: true })
  bookingId: string | null;

  @Column({ name: 'client_id' })
  clientId: string;

  @OneToOne('Booking', { nullable: true })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking | null;

  @ManyToOne('Client')
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ name: 'issue_date', type: 'timestamptz' })
  issueDate: Date;

  @Column({ name: 'due_date', type: 'timestamptz' })
  dueDate: Date;

  @Column({ name: 'paid_date', type: 'timestamptz', nullable: true })
  paidDate: Date | null;

  @Column({ type: 'jsonb', default: [] })
  items: InvoiceLineItem[];

  @MoneyColumn('sub_total')
  subTotal: number;

  @PercentColumn('tax_rate')
  taxRate: number;

  @MoneyColumn('tax_total')
  taxTotal: number;

  @MoneyColumn('total_amount')
  totalAmount: number;

  @MoneyColumn('amount_paid')
  amountPaid: number;

  @MoneyColumn('balance_due')
  balanceDue: number;

  @Column({ name: 'pdf_url', type: 'varchar', nullable: true })
  pdfUrl: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /**
   * Recalculates all invoice totals using precise decimal arithmetic.
   * Prevents floating-point precision errors in financial calculations.
   */
  calculateTotals(): void {
    // Use Decimal.js for precise financial calculations
    const subtotal = this.items.reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0));

    this.subTotal = subtotal.toDecimalPlaces(2).toNumber();
    this.taxTotal = subtotal.times(new Decimal(this.taxRate).dividedBy(100)).toDecimalPlaces(2).toNumber();
    this.totalAmount = new Decimal(this.subTotal).plus(this.taxTotal).toDecimalPlaces(2).toNumber();
    this.balanceDue = new Decimal(this.totalAmount).minus(this.amountPaid).toDecimalPlaces(2).toNumber();
  }

  /**
   * Records a payment against this invoice using precise arithmetic.
   * Automatically updates status based on remaining balance.
   */
  recordPayment(amount: number): void {
    if (amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    const amountDecimal = new Decimal(amount);
    const currentPaid = new Decimal(this.amountPaid);
    const total = new Decimal(this.totalAmount);

    this.amountPaid = currentPaid.plus(amountDecimal).toDecimalPlaces(2).toNumber();
    this.balanceDue = total.minus(this.amountPaid).toDecimalPlaces(2).toNumber();

    if (this.balanceDue <= 0) {
      this.status = InvoiceStatus.PAID;
      this.paidDate = new Date();
      this.balanceDue = 0;
    } else {
      this.status = InvoiceStatus.PARTIALLY_PAID;
    }
  }

  markAsSent(): void {
    if (this.status === InvoiceStatus.DRAFT) {
      this.status = InvoiceStatus.SENT;
      this.sentAt = new Date();
    }
  }

  cancel(): void {
    if (this.status !== InvoiceStatus.PAID) {
      this.status = InvoiceStatus.CANCELLED;
    }
  }

  isOverdue(): boolean {
    return (
      this.status !== InvoiceStatus.PAID &&
      this.status !== InvoiceStatus.CANCELLED &&
      this.status !== InvoiceStatus.VOID &&
      new Date() > this.dueDate
    );
  }
}
