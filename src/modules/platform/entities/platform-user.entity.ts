import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlatformRole } from '../enums/platform-role.enum';

/**
 * Platform-level users (superadmins)
 * Separate from tenant users for security isolation
 */
@Entity('platform_users')
@Index(['email'], { unique: true, where: 'deleted_at IS NULL' })
@Index(['status', 'createdAt'])
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: PlatformRole,
    default: PlatformRole.ANALYTICS_VIEWER,
  })
  role: PlatformRole;

  @Column({
    type: 'varchar',
    enum: ['active', 'suspended', 'locked'],
    default: 'active',
  })
  status: string;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', length: 255, nullable: true, select: false })
  mfaSecret: string | null;

  @Column({
    name: 'mfa_recovery_codes',
    type: 'json',
    nullable: true,
    select: false,
  })
  mfaRecoveryCodes: string[] | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 45, nullable: true })
  lastLoginIp: string | null;

  @Column({ name: 'ip_allowlist', type: 'json', nullable: true })
  ipAllowlist: string[] | null;

  @Column({ name: 'trusted_devices', type: 'json', nullable: true })
  trustedDevices: Array<{ deviceId: string; name: string; addedAt: Date }> | null;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword: boolean;

  @Column({ name: 'password_changed_at', type: 'timestamp', nullable: true })
  passwordChangedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
