import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import type { PurchaseInvoice } from './purchase-invoice.entity';

@Entity('vendors')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'name'])
export class Vendor extends BaseTenantEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany('PurchaseInvoice', 'vendor')
  purchaseInvoices: PurchaseInvoice[];
}
