import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DURABLE_WEBHOOK_EVENTS_FLAG,
  isWebhookOutboxEventType,
  type OutboxEventEnvelope,
} from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { ConsumerInboxService } from '../../../common/services/consumer-inbox.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { WebhookService } from '../application/webhooks.service';
import type { WebhookEvent } from '../application/webhooks.types';

export const CONSUMER_NAME = 'outbox-webhook-consumer';

/** Maps durable outbox event class names to webhook wire event types. */
const OUTBOX_TO_WEBHOOK_TYPE: Record<string, string> = {
  BookingCreatedEvent: 'booking.created',
  BookingConfirmedEvent: 'booking.confirmed',
  BookingUpdatedEvent: 'booking.updated',
  BookingCompletedEvent: 'booking.completed',
  TaskCompletedEvent: 'task.completed',
  PackagePriceChangedEvent: 'package.price_changed',
  ClientCreatedEvent: 'client.created',
  ClientUpdatedEvent: 'client.updated',
  ClientDeletedEvent: 'client.deleted',
};

@Injectable()
export class OutboxWebhookConsumer {
  private readonly logger = new Logger(OutboxWebhookConsumer.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly consumerInbox: ConsumerInboxService,
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  /**
   * Process a durable webhook outbox envelope.
   * Throws on failure so BullMQ retries; inbox row is only recorded after successful emit.
   */
  async process(envelope: OutboxEventEnvelope): Promise<void> {
    if (!isWebhookOutboxEventType(envelope.eventType)) {
      return;
    }

    if (!(this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true)) {
      this.logger.debug(`Durable webhook kill switch off — skipping ${envelope.eventId}`);
      return;
    }

    const tenantId = envelope.tenantId;
    if (!tenantId) {
      throw new Error(`Webhook outbox event ${envelope.eventId} missing tenantId`);
    }

    const webhookType = OUTBOX_TO_WEBHOOK_TYPE[envelope.eventType];
    if (!webhookType) {
      this.logger.warn(`No webhook wire type mapping for ${envelope.eventType}`);
      return;
    }

    await TenantContextService.run(tenantId, async () =>
      this.dataSource.transaction(async (manager) => {
        const claimed = await this.consumerInbox.tryClaim(CONSUMER_NAME, envelope.eventId, manager);
        if (!claimed) {
          this.logger.debug(`Duplicate webhook outbox event ${envelope.eventId} — skipping`);
          return;
        }

        const webhookEvent: WebhookEvent = {
          type: webhookType,
          tenantId,
          payload: {
            ...envelope.payload,
            aggregateId: envelope.aggregateId,
            eventId: envelope.eventId,
          },
          timestamp: envelope.occurredAt,
        };

        // Throws → transaction rolls back → inbox not recorded → BullMQ can retry.
        await this.webhookService.emit(webhookEvent, { throwOnFailure: true });

        await this.consumerInbox.recordProcessed(CONSUMER_NAME, envelope.eventId, manager);
        this.logger.log(`Outbox webhook emitted for ${webhookType} (${envelope.eventId})`);
      }),
    );
  }
}
