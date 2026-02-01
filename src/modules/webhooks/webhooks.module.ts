import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook, WebhookDelivery } from './entities';
import { BookingConfirmedWebhookHandler } from './handlers/booking-confirmed.handler';
import { BookingCreatedWebhookHandler } from './handlers/booking-created.handler';
import { BookingUpdatedWebhookHandler } from './handlers/booking-updated.handler';
import { TaskCompletedWebhookHandler } from './handlers/task-completed.handler';
import { WebhookProcessor } from './processors/webhook.processor';
import { WebhookDeliveryRepository } from './repositories/webhook-delivery.repository';
import { WebhookRepository } from './repositories/webhook.repository';
import { WebhookService } from './webhooks.service';
import { WEBHOOK_QUEUE } from './webhooks.types';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
    BullModule.registerQueue({
      name: WEBHOOK_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    CqrsModule,
  ],
  providers: [
    WebhookService,
    WebhookProcessor,
    EncryptionService,
    BookingConfirmedWebhookHandler,
    BookingCreatedWebhookHandler,
    BookingUpdatedWebhookHandler,
    TaskCompletedWebhookHandler,
    WebhookRepository,
    WebhookDeliveryRepository,
  ],
  exports: [WebhookService, WebhookRepository, WebhookDeliveryRepository],
})
export class WebhooksModule {}
