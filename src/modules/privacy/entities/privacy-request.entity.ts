import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

export enum PrivacyRequestType {
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_DELETION = 'DATA_DELETION',
}

export enum PrivacyRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('privacy_requests')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'type'])
export class PrivacyRequest extends BaseTenantEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: PrivacyRequestType,
  })
  type: PrivacyRequestType;

  @Column({
    type: 'enum',
    enum: PrivacyRequestStatus,
    default: PrivacyRequestStatus.PENDING,
  })
  status: PrivacyRequestStatus;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'NOW()' })
  requestedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'download_url', type: 'text', nullable: true })
  downloadUrl: string | null;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_by', type: 'text', nullable: true })
  processedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne('User', { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processor: User | null;

  startProcessing(): void {
    this.status = PrivacyRequestStatus.PROCESSING;
    this.processedAt = new Date();
  }

  complete(downloadUrl?: string, filePath?: string): void {
    this.status = PrivacyRequestStatus.COMPLETED;
    this.completedAt = new Date();
    if (downloadUrl) this.downloadUrl = downloadUrl;
    if (filePath) this.filePath = filePath;
    // Export links expire in 7 days
    if (this.type === PrivacyRequestType.DATA_EXPORT) {
      this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  fail(errorMessage: string): void {
    this.status = PrivacyRequestStatus.FAILED;
    this.errorMessage = errorMessage;
    this.completedAt = new Date();
  }

  cancel(): void {
    if (this.status === PrivacyRequestStatus.PENDING) {
      this.status = PrivacyRequestStatus.CANCELLED;
      this.completedAt = new Date();
    }
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }
}
