import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Webhook } from './webhook.entity';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Entity('webhook_deliveries')
@Index(['tenantId', 'id'], { unique: true })
@Index(['tenantId', 'webhookId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'createdAt'])
export class WebhookDelivery extends BaseTenantEntity {
  @Column({ name: 'webhook_id' })
  webhookId: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ type: 'jsonb', name: 'request_body' })
  requestBody: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'request_headers', nullable: true })
  requestHeaders: Record<string, string> | null;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'text', name: 'response_body', nullable: true })
  responseBody: string | null;

  @Column({ name: 'attempt_number', default: 1 })
  attemptNumber: number;

  @Column({ name: 'max_attempts', default: 5 })
  maxAttempts: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @ManyToOne(() => Webhook, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook: Webhook;

  recordSuccess(
    responseStatus: number,
    responseBody: string,
    durationMs: number,
  ): void {
    this.status = DeliveryStatus.SUCCESS;
    this.responseStatus = responseStatus;
    this.responseBody = responseBody?.substring(0, 10000);
    this.durationMs = durationMs;
    this.deliveredAt = new Date();
    this.nextRetryAt = null;
    this.errorMessage = null;
  }

  recordFailure(
    errorMessage: string,
    responseStatus?: number,
    responseBody?: string,
  ): void {
    this.attemptNumber++;
    this.errorMessage = errorMessage;
    this.responseStatus = responseStatus ?? null;
    this.responseBody = responseBody?.substring(0, 10000) ?? null;

    if (this.attemptNumber >= this.maxAttempts) {
      this.status = DeliveryStatus.FAILED;
      this.nextRetryAt = null;
    } else {
      this.status = DeliveryStatus.RETRYING;
      const backoffMs = Math.pow(2, this.attemptNumber) * 30000;
      this.nextRetryAt = new Date(Date.now() + backoffMs);
    }
  }

  canRetry(): boolean {
    return (
      this.status === DeliveryStatus.RETRYING &&
      this.attemptNumber < this.maxAttempts &&
      this.nextRetryAt !== null &&
      new Date() >= this.nextRetryAt
    );
  }
}
