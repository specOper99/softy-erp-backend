import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformUser } from './platform-user.entity';

/**
 * Platform user sessions with enhanced security tracking
 */
@Entity('platform_sessions')
@Index(['userId', 'expiresAt'])
@Index(['sessionToken'], { unique: true })
@Index(['isRevoked', 'expiresAt'])
export class PlatformSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => PlatformUser)
  @JoinColumn({ name: 'user_id' })
  user: PlatformUser;

  @Column({ name: 'session_token', type: 'text', unique: true })
  sessionToken: string;

  @Column({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({ name: 'device_id', type: 'text', nullable: true })
  deviceId: string | null;

  @Column({ name: 'device_name', type: 'text', nullable: true })
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
