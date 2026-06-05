import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { areBackgroundJobsEnabled } from '../../common/queue/background-jobs.runtime';
import { MetricsModule } from '../metrics/metrics.module';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookProcessor } from './processors/webhook.processor';
import { WebhookDeliveryRepository } from './repositories/webhook-delivery.repository';
import { WebhookRepository } from './repositories/webhook.repository';
import { WebhookService } from './webhooks.service';
import { WEBHOOK_QUEUE } from './webhooks.types';
import { CqrsModule } from '@nestjs/cqrs';

const backgroundJobsEnabled = areBackgroundJobsEnabled();

@Module({
  imports: [
    CqrsModule,
    CommonModule,
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
    ...(backgroundJobsEnabled ? [WebhookProcessor] : []),
  ],
  exports: [WebhookService],
})
export class WebhooksModule {}
