import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/abstract.entity';
import { Webhook } from './webhook.entity';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Entity('webhook_deliveries')
export class WebhookDelivery extends BaseTenantEntity {
  @Column({ name: 'webhook_id', type: 'uuid' })
  webhookId: string;

  @ManyToOne(() => Webhook, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook: Webhook;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ name: 'request_body', type: 'jsonb' })
  requestBody: Record<string, unknown>;

  @Column({ name: 'request_headers', type: 'jsonb', nullable: true })
  requestHeaders?: Record<string, string> | null;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus?: number | null;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody?: string | null;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 5 })
  maxAttempts: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt?: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt?: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  recordSuccess(status: number, responseBody: string, durationMs: number): void {
    this.status = DeliveryStatus.SUCCESS;
    this.responseStatus = status;
    this.responseBody = responseBody ? responseBody.substring(0, 10000) : null;
    this.durationMs = durationMs;
    this.deliveredAt = new Date();
    this.errorMessage = null;
    this.nextRetryAt = null;
  }

  recordFailure(errorMessage: string): void {
    const errorMsgSub = errorMessage ? errorMessage.substring(0, 1000) : 'Unknown error';
    this.errorMessage = errorMsgSub;

    if (this.attemptNumber >= this.maxAttempts) {
      this.status = DeliveryStatus.FAILED;
      this.nextRetryAt = null;
    } else {
      this.status = DeliveryStatus.RETRYING;
      const delayMs = 30000 * Math.pow(2, this.attemptNumber - 1);
      this.nextRetryAt = new Date(Date.now() + delayMs);
      this.attemptNumber += 1;
    }
  }

  canRetry(): boolean {
    return this.status === DeliveryStatus.RETRYING && this.attemptNumber <= this.maxAttempts;
  }
}
