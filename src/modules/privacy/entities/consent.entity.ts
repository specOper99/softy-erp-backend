import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

export enum ConsentType {
  TERMS_OF_SERVICE = 'TERMS_OF_SERVICE',
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  MARKETING_EMAILS = 'MARKETING_EMAILS',
  DATA_PROCESSING = 'DATA_PROCESSING',
  ANALYTICS = 'ANALYTICS',
  THIRD_PARTY_SHARING = 'THIRD_PARTY_SHARING',
}

@Entity('consents')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'userId', 'type'], { unique: true })
@Index(['tenantId', 'type'])
export class Consent extends BaseTenantEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ConsentType,
  })
  type: ConsentType;

  @Column({ default: false })
  granted: boolean;

  @Column({ name: 'granted_at', type: 'timestamptz', nullable: true })
  grantedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'policy_version', type: 'varchar', nullable: true })
  policyVersion: string | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string | null;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  grant(ipAddress?: string, userAgent?: string, policyVersion?: string): void {
    this.granted = true;
    this.grantedAt = new Date();
    this.revokedAt = null;
    this.ipAddress = ipAddress ?? null;
    this.userAgent = userAgent ?? null;
    this.policyVersion = policyVersion ?? null;
  }

  revoke(): void {
    this.granted = false;
    this.revokedAt = new Date();
  }
}
