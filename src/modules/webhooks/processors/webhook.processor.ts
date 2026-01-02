import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Webhook } from '../entities/webhook.entity';
import { WebhookEvent, WebhookService } from '../webhooks.service';

export const WEBHOOK_QUEUE = 'webhook';

export interface WebhookJobData {
  webhook: {
    id: string;
    tenantId: string;
    url: string;
    secret: string;
    events: string[];
  };
  event: WebhookEvent;
}

/**
 * Webhook processor for handling background webhook delivery.
 * Processes jobs from the 'webhook' queue with exponential backoff retries.
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @Inject(forwardRef(() => WebhookService))
    private readonly webhookService: WebhookService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { webhook, event } = job.data;
    this.logger.log(
      `Processing webhook job ${job.id}: ${event.type} to ${webhook.url}`,
    );

    try {
      // Create a partial Webhook entity for the service method
      const webhookEntity = {
        id: webhook.id,
        tenantId: webhook.tenantId,
        url: webhook.url,
        secret: webhook.secret,
        events: webhook.events,
      } as Webhook;

      await this.webhookService.deliverWebhook(webhookEntity, event);

      this.logger.log(
        `Webhook job ${job.id} completed: ${event.type} to ${webhook.url}`,
      );
    } catch (error) {
      this.logger.error(
        `Webhook job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to trigger BullMQ retry
    }
  }
}
