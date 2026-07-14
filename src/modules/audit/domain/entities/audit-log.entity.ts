import { createHash } from 'crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('UQ_audit_logs_tenant_sequence', ['tenantId', 'sequenceNumber'], {
  unique: true,
  where: '"sequence_number" IS NOT NULL',
})
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string;

  @Column()
  action: string;

  @Column({ name: 'entity_name' })
  entityName: string;

  @Index()
  @Column({ name: 'entity_id', nullable: true })
  entityId?: string;

  @Column({ type: 'jsonb', name: 'old_values', nullable: true })
  oldValues: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'new_values', nullable: true })
  newValues: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent: string;

  @Column({ name: 'method', nullable: true })
  method: string;

  @Column({ name: 'path', nullable: true })
  path: string;

  @Column({ name: 'status_code', nullable: true })
  statusCode: number;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs: number;

  @Index()
  @Column({ name: 'hash', length: 64, nullable: true })
  hash: string;

  @Column({ name: 'previous_hash', length: 64, nullable: true })
  previousHash: string;

  @Column({
    name: 'sequence_number',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null | undefined) => value,
      from: (value: string | null) => (value !== null && value !== undefined ? Number(value) : null),
    },
  })
  sequenceNumber: number;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  calculateHash(): string {
    const payload = JSON.stringify({
      oldValues: this.oldValues ?? {},
      newValues: this.newValues ?? {},
    });
    const data = [
      this.createdAt?.toISOString() ?? '',
      this.action ?? '',
      this.entityName ?? '',
      this.entityId ?? '',
      this.userId ?? '',
      this.tenantId ?? '',
      this.previousHash ?? '',
      this.sequenceNumber?.toString() ?? '',
      payload,
    ].join('|');

    return createHash('sha256').update(data).digest('hex');
  }

  verifyHash(): boolean {
    if (!this.hash) return false;
    return this.hash === this.calculateHash();
  }
}
