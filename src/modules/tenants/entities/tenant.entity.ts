import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Currency } from '../../finance/enums/currency.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { TenantStatus } from '../enums/tenant-status.enum';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: Currency,
    name: 'base_currency',
    default: Currency.USD,
  })
  baseCurrency: Currency;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status: TenantStatus;

  @Column({
    name: 'default_tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 15.0,
  })
  defaultTaxRate: number;

  @Column({
    type: 'jsonb',
    name: 'cancellation_policy_days',
    default: () =>
      '\'[{"daysBeforeEvent": 7, "refundPercentage": 100}, {"daysBeforeEvent": 0, "refundPercentage": 0}]\'',
  })
  cancellationPolicyDays: {
    daysBeforeEvent: number;
    refundPercentage: number;
  }[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.children, { nullable: true })
  @JoinColumn({ name: 'parent_tenant_id' })
  parent: Tenant;

  @OneToMany(() => Tenant, (tenant) => tenant.parent)
  children: Tenant[];

  @Column({
    type: 'jsonb',
    default: '{}',
    comment: 'Resource quotas (e.g. max_users: 10, max_storage_gb: 5)',
  })
  quotas: Record<string, number>;
}
