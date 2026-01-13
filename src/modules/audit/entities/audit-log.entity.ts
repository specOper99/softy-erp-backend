import { createHash } from 'crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
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
  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ type: 'jsonb', name: 'old_values', nullable: true })
  oldValues: unknown;

  @Column({ type: 'jsonb', name: 'new_values', nullable: true })
  newValues: unknown;

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

  @Column({ name: 'sequence_number', type: 'bigint', nullable: true })
  sequenceNumber: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', primary: true })
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
