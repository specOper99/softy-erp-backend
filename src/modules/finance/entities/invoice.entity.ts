import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { MoneyColumn, PercentColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';

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

  @OneToOne(() => Booking, { nullable: true })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking | null;

  @ManyToOne(() => Client)
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

  calculateTotals(): void {
    this.subTotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    this.taxTotal = this.subTotal * (this.taxRate / 100);
    this.totalAmount = this.subTotal + this.taxTotal;
    this.balanceDue = this.totalAmount - this.amountPaid;
  }

  recordPayment(amount: number): void {
    this.amountPaid += amount;
    this.balanceDue = this.totalAmount - this.amountPaid;

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
