import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformUser } from './platform-user.entity';

/**
 * Tracks all impersonation sessions for support and auditing
 */
@Entity('impersonation_sessions')
@Index(['platformUserId', 'startedAt'])
@Index(['tenantId', 'targetUserId'])
@Index(['platformUserId', 'tenantId', 'targetUserId'], {
  unique: true,
  where: 'is_active = true',
})
@Index(['startedAt', 'endedAt'])
export class ImpersonationSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'platform_user_id', type: 'uuid' })
  platformUserId: string;

  @ManyToOne(() => PlatformUser)
  @JoinColumn({ name: 'platform_user_id' })
  platformUser: PlatformUser;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'target_user_id', type: 'uuid' })
  targetUserId: string;

  @Column({ name: 'target_user_email', type: 'varchar', length: 255 })
  targetUserEmail: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'approval_ticket_id', type: 'varchar', length: 255, nullable: true })
  approvalTicketId: string | null;

  @Column({ name: 'session_token_hash', type: 'varchar', length: 64, unique: true })
  sessionTokenHash: string;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({ name: 'actions_performed', type: 'jsonb', default: '[]' })
  actionsPerformed: Array<{
    action: string;
    timestamp: Date;
    endpoint: string;
    method: string;
  }>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'ended_by', type: 'uuid', nullable: true })
  endedBy: string | null;

  @Column({ name: 'end_reason', type: 'varchar', length: 500, nullable: true })
  endReason: string | null;
}
