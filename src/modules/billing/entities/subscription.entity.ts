import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/abstract.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  UNPAID = 'UNPAID',
  INCOMPLETE = 'INCOMPLETE',
  INCOMPLETE_EXPIRED = 'INCOMPLETE_EXPIRED',
  PAUSED = 'PAUSED',
}

export enum BillingInterval {
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

@Entity('subscriptions')
@Index(['tenantId'], { unique: true })
@Index(['stripeSubscriptionId'], { unique: true })
export class Subscription extends BaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'stripe_subscription_id' })
  stripeSubscriptionId: string;

  @Column({ name: 'stripe_customer_id' })
  stripeCustomerId: string;

  @Column({ name: 'stripe_price_id' })
  stripePriceId: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.INCOMPLETE,
  })
  status: SubscriptionStatus;

  @Column({
    type: 'enum',
    enum: BillingInterval,
    name: 'billing_interval',
    default: BillingInterval.MONTH,
  })
  billingInterval: BillingInterval;

  @Column({ name: 'current_period_start', type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz' })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'trial_start', type: 'timestamptz', nullable: true })
  trialStart: Date | null;

  @Column({ name: 'trial_end', type: 'timestamptz', nullable: true })
  trialEnd: Date | null;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  isActive(): boolean {
    return this.status === SubscriptionStatus.ACTIVE || this.status === SubscriptionStatus.TRIALING;
  }

  isPastDue(): boolean {
    return this.status === SubscriptionStatus.PAST_DUE;
  }

  isTrialing(): boolean {
    return this.status === SubscriptionStatus.TRIALING;
  }
}
