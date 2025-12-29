import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface WebhookEvent {
  type:
    | 'booking.created'
    | 'booking.updated'
    | 'booking.cancelled'
    | 'task.created'
    | 'task.assigned'
    | 'task.completed'
    | 'payroll.processed';
  tenantId: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

/**
 * Webhook service for sending event notifications to external systems.
 * Events are sent asynchronously and failures are logged but don't block.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhooks: Map<string, WebhookConfig[]> = new Map();

  constructor(private configService: ConfigService) {}

  /**
   * Register a webhook endpoint for a tenant
   */
  registerWebhook(tenantId: string, config: WebhookConfig): void {
    const existing = this.webhooks.get(tenantId) || [];
    existing.push(config);
    this.webhooks.set(tenantId, existing);
    this.logger.log(`Registered webhook for tenant ${tenantId}: ${config.url}`);
  }

  /**
   * Emit an event to all registered webhooks for the tenant
   */
  async emit(event: WebhookEvent): Promise<void> {
    const configs = this.webhooks.get(event.tenantId) || [];

    const deliveries = configs.map(async (config) => {
      if (!config.events.includes(event.type) && !config.events.includes('*')) {
        return;
      }

      try {
        await this.sendWebhook(config, event);
      } catch (error) {
        this.logger.error(
          `Webhook delivery failed to ${config.url}: ${(error as Error).message}`,
        );
      }
    });

    await Promise.all(deliveries);
  }

  /**
   * Send webhook with HMAC signature
   */
  private async sendWebhook(
    config: WebhookConfig,
    event: WebhookEvent,
  ): Promise<void> {
    const body = JSON.stringify(event);
    const signature = this.createSignature(body, config.secret);

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.type,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    this.logger.log(
      `Webhook delivered to ${config.url} for event ${event.type}`,
    );
  }

  /**
   * Create HMAC-SHA256 signature for webhook payload
   */
  private createSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
