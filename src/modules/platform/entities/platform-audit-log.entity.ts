import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformUser } from './platform-user.entity';

/**
 * Immutable audit log for all platform actions
 * Append-only, never modified or deleted
 */
@Entity('platform_audit_logs')
@Index(['platformUserId', 'performedAt'])
@Index(['action', 'performedAt'])
@Index(['targetTenantId', 'performedAt'])
@Index(['performedAt'])
export class PlatformAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'platform_user_id', type: 'uuid' })
  platformUserId: string;

  @ManyToOne(() => PlatformUser)
  @JoinColumn({ name: 'platform_user_id' })
  platformUser: PlatformUser;

  @Column({
    type: 'enum',
    enum: PlatformAction,
  })
  action: PlatformAction;

  @Column({ name: 'target_tenant_id', type: 'uuid', nullable: true })
  targetTenantId: string | null;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  @Column({ name: 'target_entity_type', type: 'varchar', length: 100, nullable: true })
  targetEntityType: string | null;

  @Column({ name: 'target_entity_id', type: 'varchar', length: 255, nullable: true })
  targetEntityId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 255, nullable: true })
  requestId: string | null;

  @Column({ name: 'changes_before', type: 'jsonb', nullable: true })
  changesBefore: Record<string, unknown> | null;

  @Column({ name: 'changes_after', type: 'jsonb', nullable: true })
  changesAfter: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'performed_at' })
  performedAt: Date;

  @Column({ name: 'additional_context', type: 'jsonb', nullable: true })
  additionalContext: Record<string, unknown> | null;
}
