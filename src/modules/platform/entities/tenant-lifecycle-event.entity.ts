import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Tracks tenant lifecycle events for analytics and compliance
 */
@Entity('tenant_lifecycle_events')
@Index(['tenantId', 'eventType', 'occurredAt'])
export class TenantLifecycleEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 100,
  })
  eventType: string;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @Column({ name: 'triggered_by_type', type: 'varchar', length: 50 })
  triggeredByType: 'platform_user' | 'system' | 'tenant_user';

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'previous_state', type: 'jsonb', nullable: true })
  previousState: Record<string, unknown> | null;

  @Column({ name: 'new_state', type: 'jsonb', nullable: true })
  newState: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
