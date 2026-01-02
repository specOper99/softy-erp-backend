import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { Repository } from 'typeorm';
import { WEBHOOK_CONSTANTS } from '../../common/constants';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import { WEBHOOK_QUEUE, WebhookJobData } from './processors/webhook.processor';

export interface WebhookEvent {
  type:
    | 'booking.created'
    | 'booking.confirmed'
    | 'booking.updated'
    | 'booking.cancelled'
    | 'task.created'
    | 'task.assigned'
    | 'task.completed'
    | 'payroll.processed';
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

/**
 * Webhook service for sending event notifications to external systems.
 * Refactored for database persistence, exponential backoff retries,
 * URL validation, and request timeouts.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly MAX_RETRIES = WEBHOOK_CONSTANTS.MAX_RETRIES;
  private readonly INITIAL_RETRY_DELAY = WEBHOOK_CONSTANTS.INITIAL_RETRY_DELAY;
  private readonly WEBHOOK_TIMEOUT = WEBHOOK_CONSTANTS.TIMEOUT;

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    @Optional()
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {}

  /**
   * Register a webhook endpoint for a tenant (persisted in DB)
   */
  async registerWebhook(
    tenantId: string,
    config: WebhookConfig,
  ): Promise<void> {
    // URL Validation
    try {
      const url = new URL(config.url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new BadRequestException('Invalid webhook URL');
    }

    // Encrypt the secret before storing
    const encryptedSecret = this.encryptionService.encrypt(config.secret);

    const webhook = this.webhookRepository.create({
      tenantId,
      url: config.url,
      secret: encryptedSecret,
      events: config.events,
    });

    await this.webhookRepository.save(webhook);
    this.logger.log(
      `Registered and persisted webhook for tenant ${tenantId}: ${config.url}`,
    );
  }

  /**
   * Emit an event to all registered webhooks for the tenant.
   * If queue is available, jobs are enqueued for background processing.
   * Otherwise falls back to inline delivery.
   */
  async emit(event: WebhookEvent): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { tenantId: event.tenantId, isActive: true },
    });

    const deliveries = webhooks.map(async (webhook) => {
      if (
        !webhook.events.includes(event.type) &&
        !webhook.events.includes('*')
      ) {
        return;
      }

      if (this.webhookQueue) {
        // Enqueue for background processing
        await this.webhookQueue.add(
          `${event.type}-${webhook.id}`,
          {
            webhook: {
              id: webhook.id,
              tenantId: webhook.tenantId,
              url: webhook.url,
              secret: webhook.secret,
              events: webhook.events,
            },
            event,
          },
          {
            attempts: 5,
            backoff: { type: 'exponential', delay: 30000 },
          },
        );
        this.logger.log(`Queued webhook ${event.type} for ${webhook.url}`);
      } else {
        // Fallback to inline delivery
        await this.sendWebhookWithRetry(webhook, event);
      }
    });

    await Promise.allSettled(deliveries);
  }

  /**
   * Deliver webhook directly (called by processor or inline fallback)
   */
  async deliverWebhook(webhook: Webhook, event: WebhookEvent): Promise<void> {
    await this.sendWebhookOnce(webhook, event);
  }

  /**
   * Send webhook with exponential backoff retry
   */
  private async sendWebhookWithRetry(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        await this.sendWebhookOnce(webhook, event);
        return;
      } catch (error) {
        if (attempt === this.MAX_RETRIES - 1) {
          this.logger.error(
            `Webhook delivery failed to ${webhook.url} after ${this.MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Single attempt to send webhook with timeout
   */
  private async sendWebhookOnce(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    const body = JSON.stringify(event);

    // Decrypt the secret for signature creation
    const decryptedSecret = this.encryptionService.isEncrypted(webhook.secret)
      ? this.encryptionService.decrypt(webhook.secret)
      : webhook.secret; // Handle legacy unencrypted secrets

    const signature = this.createSignature(body, decryptedSecret);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.WEBHOOK_TIMEOUT,
    );

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.type,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(
        `Webhook delivered to ${webhook.url} for event ${event.type}`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Webhook request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create HMAC-SHA256 signature for webhook payload
   */
  private createSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
