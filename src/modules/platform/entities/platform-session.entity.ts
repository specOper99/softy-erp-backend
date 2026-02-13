import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformUser } from './platform-user.entity';

/**
 * Platform user sessions with enhanced security tracking
 */
@Entity('platform_sessions')
@Index(['userId', 'expiresAt'])
@Index(['sessionTokenHash'], { unique: true, where: 'session_token_hash IS NOT NULL' })
@Index(['isRevoked', 'expiresAt'])
export class PlatformSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => PlatformUser)
  @JoinColumn({ name: 'user_id' })
  user: PlatformUser;

  @Column({ name: 'session_token_hash', type: 'varchar', length: 64, nullable: true })
  sessionTokenHash: string | null;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, nullable: true })
  refreshTokenHash: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName: string | null;

  @Column({ name: 'mfa_verified', type: 'boolean', default: false })
  mfaVerified: boolean;

  @Column({ name: 'mfa_verified_at', type: 'timestamp', nullable: true })
  mfaVerifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'last_activity_at', type: 'timestamp' })
  lastActivityAt: Date;

  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 500, nullable: true })
  revokedReason: string | null;
}
