import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'is_revoked', default: false })
  isRevoked: boolean;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'device_name', type: 'varchar', nullable: true })
  deviceName: string | null;

  @Column({ name: 'location', type: 'varchar', nullable: true })
  location: string | null;

  @Column({
    name: 'last_ip_address',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  lastIpAddress: string | null;

  @Column({ name: 'ip_changed', default: false })
  ipChanged: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isRevoked && !this.isExpired();
  }

  updateActivity(ipAddress: string): void {
    this.lastUsedAt = new Date();
    if (this.ipAddress && ipAddress !== this.ipAddress) {
      this.lastIpAddress = this.ipAddress;
      this.ipChanged = true;
    }
    this.ipAddress = ipAddress;
  }

  toSessionInfo(): SessionInfo {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      deviceName: this.deviceName,
      location: this.location,
      ipChanged: this.ipChanged,
      isExpired: this.isExpired(),
    };
  }
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  location: string | null;
  ipChanged: boolean;
  isExpired: boolean;
}
