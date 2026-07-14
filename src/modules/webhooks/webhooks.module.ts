import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { OUTBOX_WEBHOOK_CONSUMER } from '../../common/outbox/outbox-consumer.port';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { areBackgroundJobsEnabled } from '../../common/queue/background-jobs.runtime';
import { MetricsModule } from '../metrics/metrics.module';
import { BookingCompletedWebhookHandler } from './application/booking-completed.handler';
import { BookingConfirmedWebhookHandler } from './application/booking-confirmed.handler';
import { BookingCreatedWebhookHandler } from './application/booking-created.handler';
import { BookingUpdatedWebhookHandler } from './application/booking-updated.handler';
import { ClientCreatedWebhookHandler } from './application/client-created.handler';
import { ClientDeletedWebhookHandler } from './application/client-deleted.handler';
import { ClientUpdatedWebhookHandler } from './application/client-updated.handler';
import { PackagePriceChangedWebhookHandler } from './application/package-price-changed.handler';
import { TaskCompletedWebhookHandler } from './application/task-completed.handler';
import { WebhookService } from './application/webhooks.service';
import { WEBHOOK_QUEUE } from './application/webhooks.types';
import { OutboxWebhookConsumer } from './consumers/outbox-webhook.consumer';
import { Webhook, WebhookDelivery } from './domain/entities';
import { WebhookDeliveryRepository } from './infrastructure/webhook-delivery.repository';
import { WebhookProcessor } from './infrastructure/webhook.processor';
import { WebhookRepository } from './infrastructure/webhook.repository';

const backgroundJobsEnabled = areBackgroundJobsEnabled();

@Module({
  imports: [
    CqrsModule,
    forwardRef(() => CommonModule),
    forwardRef(() => OutboxModule),
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
    MetricsModule,
    ...(backgroundJobsEnabled
      ? [
          BullModule.registerQueue({
            name: WEBHOOK_QUEUE,
          }),
        ]
      : []),
  ],
  providers: [
    WebhookService,
    WebhookRepository,
    WebhookDeliveryRepository,
    BookingCreatedWebhookHandler,
    BookingConfirmedWebhookHandler,
    BookingUpdatedWebhookHandler,
    BookingCompletedWebhookHandler,
    TaskCompletedWebhookHandler,
    PackagePriceChangedWebhookHandler,
    ClientCreatedWebhookHandler,
    ClientUpdatedWebhookHandler,
    ClientDeletedWebhookHandler,
    OutboxWebhookConsumer,
    {
      provide: OUTBOX_WEBHOOK_CONSUMER,
      useExisting: OutboxWebhookConsumer,
    },
    ...(backgroundJobsEnabled ? [WebhookProcessor] : []),
  ],
  exports: [WebhookService, OUTBOX_WEBHOOK_CONSUMER],
})
export class WebhooksModule {}
