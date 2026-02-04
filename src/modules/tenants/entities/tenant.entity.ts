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

  @Column({ name: 'timezone', type: 'varchar', length: 100, default: 'UTC' })
  timezone: string;

  @Column({
    type: 'jsonb',
    name: 'working_hours',
    nullable: true,
  })
  workingHours:
    | {
        day: string;
        startTime: string;
        endTime: string;
        isOpen: boolean;
      }[]
    | null;

  @Column({
    type: 'jsonb',
    name: 'branding',
    nullable: true,
  })
  branding: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
  } | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'address', type: 'varchar', length: 200, nullable: true })
  address: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'email', type: 'varchar', length: 100, nullable: true })
  email: string | null;

  @Column({ name: 'website', type: 'varchar', length: 255, nullable: true })
  website: string | null;

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

  // Platform administration fields
  @Column({ name: 'subscription_tier', type: 'varchar', length: 50, nullable: true })
  subscriptionTier: string | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true })
  billingEmail: string | null;

  @Column({ name: 'subscription_started_at', type: 'timestamp', nullable: true })
  subscriptionStartedAt: Date | null;

  @Column({ name: 'subscription_ends_at', type: 'timestamp', nullable: true })
  subscriptionEndsAt: Date | null;

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
  trialEndsAt: Date | null;

  @Column({ name: 'suspended_at', type: 'timestamp', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'suspended_by', type: 'uuid', nullable: true })
  suspendedBy: string | null;

  @Column({ name: 'suspension_reason', type: 'text', nullable: true })
  suspensionReason: string | null;

  @Column({ name: 'grace_period_ends_at', type: 'timestamp', nullable: true })
  gracePeriodEndsAt: Date | null;

  @Column({ name: 'deletion_scheduled_at', type: 'timestamp', nullable: true })
  deletionScheduledAt: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  @Column({ name: 'total_users', type: 'int', default: 0 })
  totalUsers: number;

  @Column({ name: 'total_bookings', type: 'int', default: 0 })
  totalBookings: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalRevenue: number;

  @Column({ name: 'mrr', type: 'decimal', precision: 10, scale: 2, default: 0, comment: 'Monthly Recurring Revenue' })
  mrr: number;

  @Column({ name: 'risk_score', type: 'decimal', precision: 3, scale: 2, default: 0, comment: 'Risk score 0-1' })
  riskScore: number;

  @Column({ name: 'health_score', type: 'decimal', precision: 3, scale: 2, default: 1, comment: 'Health score 0-1' })
  healthScore: number;

  @Column({ name: 'compliance_flags', type: 'json', default: '[]' })
  complianceFlags: string[];

  @Column({ name: 'security_policies', type: 'jsonb', nullable: true })
  securityPolicies: Record<string, unknown> | null;

  @Column({ name: 'custom_rate_limits', type: 'jsonb', nullable: true })
  customRateLimits: Record<string, number> | null;

  @Column({ name: 'feature_flags', type: 'jsonb', default: '{}' })
  featureFlags: Record<string, boolean>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  // Client Portal Scheduling Configuration (workingHours schema is kept as array shape for compatibility)
  // Additional scheduling columns are defined below.

  @Column({
    name: 'default_booking_duration_hours',
    type: 'decimal',
    precision: 4,
    scale: 2,
    nullable: true,
    default: 2.0,
  })
  defaultBookingDurationHours: number | null;

  @Column({
    name: 'max_concurrent_bookings_per_slot',
    type: 'int',
    default: 1,
  })
  maxConcurrentBookingsPerSlot: number;

  @Column({
    name: 'time_slot_duration_minutes',
    type: 'int',
    default: 60,
  })
  timeSlotDurationMinutes: number;

  @Column({
    name: 'minimum_notice_period_hours',
    type: 'int',
    default: 24,
  })
  minimumNoticePeriodHours: number;

  @Column({
    name: 'max_advance_booking_days',
    type: 'int',
    default: 90,
  })
  maxAdvanceBookingDays: number;

  @Column({
    name: 'notification_emails',
    type: 'jsonb',
    default: () => "'[]'",
  })
  notificationEmails: string[];
}
