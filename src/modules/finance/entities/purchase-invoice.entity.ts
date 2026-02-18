import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MoneyColumn } from '../../../common/decorators/column.decorators';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Transaction } from './transaction.entity';
import { Vendor } from './vendor.entity';

@Entity('purchase_invoices')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'vendorId', 'invoiceNumber'], { unique: true })
@Index(['tenantId', 'invoiceDate'])
@Index(['tenantId', 'transactionId'], { unique: true })
export class PurchaseInvoice extends BaseTenantEntity {
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'invoice_number', type: 'varchar' })
  invoiceNumber: string;

  @Column({ name: 'invoice_date', type: 'timestamptz' })
  invoiceDate: Date;

  @MoneyColumn('total_amount')
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Vendor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @ManyToOne(() => Transaction, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
