import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/abstract.entity';

export enum UsageMetric {
  USERS = 'USERS',
  BOOKINGS = 'BOOKINGS',
  STORAGE_GB = 'STORAGE_GB',
  API_CALLS = 'API_CALLS',
}

@Entity('usage_records')
@Index(['tenantId', 'metric', 'periodStart'])
@Index(['tenantId', 'reportedAt'])
export class UsageRecord extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscription_id', type: 'text', nullable: true })
  subscriptionId: string | null;

  @Column({
    type: 'enum',
    enum: UsageMetric,
  })
  metric: UsageMetric;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  @Column({ name: 'reported_at', type: 'timestamptz', default: () => 'NOW()' })
  reportedAt: Date;

  @Column({ name: 'stripe_usage_record_id', type: 'text', nullable: true })
  stripeUsageRecordId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;
}
