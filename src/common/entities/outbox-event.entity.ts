import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum OutboxStatus {
  PENDING = 'PENDING',
  /** Legacy alias — prefer DISPATCHED for new rows. */
  PUBLISHED = 'PUBLISHED',
  DISPATCHED = 'DISPATCHED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

@Entity('outbox_events')
@Index('IDX_outbox_events_pending_dispatch', ['status', 'nextAttemptAt', 'createdAt'], {
  where: `"status" = 'PENDING'`,
})
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  aggregateId!: string;

  @Column({ type: 'varchar', nullable: true })
  aggregateType?: string | null;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null;

  @Column({ type: 'int', default: 1 })
  eventVersion!: number;

  @Column({ type: 'varchar', nullable: true })
  correlationId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  occurredAt?: Date | null;

  @Column({
    type: 'enum',
    enum: OutboxStatus,
    default: OutboxStatus.PENDING,
  })
  status!: OutboxStatus;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'varchar', nullable: true })
  claimedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimLeaseExpiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deadLetteredAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
