import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/abstract.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('billing_customers')
@Index(['tenantId'], { unique: true })
@Index(['stripeCustomerId'], { unique: true })
export class BillingCustomer extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'stripe_customer_id', type: 'text' })
  stripeCustomerId: string;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ name: 'default_payment_method_id', type: 'text', nullable: true })
  defaultPaymentMethodId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  @Column({ name: 'tax_exempt', default: false })
  taxExempt: boolean;

  @Column({ name: 'invoice_prefix', type: 'text', nullable: true })
  invoicePrefix: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
