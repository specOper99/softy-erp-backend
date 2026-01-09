import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/abstract.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum PaymentMethodType {
  CARD = 'CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
  SEPA_DEBIT = 'SEPA_DEBIT',
}

@Entity('payment_methods')
@Index(['tenantId'])
@Index(['stripePaymentMethodId'], { unique: true })
export class PaymentMethod extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'stripe_payment_method_id', type: 'text' })
  stripePaymentMethodId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodType,
    default: PaymentMethodType.CARD,
  })
  type: PaymentMethodType;

  @Column({ type: 'text', nullable: true })
  brand: string | null;

  @Column({ name: 'last_four', type: 'varchar', length: 4, nullable: true })
  lastFour: string | null;

  @Column({ name: 'exp_month', type: 'int', nullable: true })
  expMonth: number | null;

  @Column({ name: 'exp_year', type: 'int', nullable: true })
  expYear: number | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ type: 'jsonb', nullable: true })
  billingDetails: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  isExpired(): boolean {
    if (!this.expMonth || !this.expYear) return false;
    const now = new Date();
    const expDate = new Date(this.expYear, this.expMonth, 0);
    return now > expDate;
  }
}
