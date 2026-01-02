import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import { BookingConfirmedWebhookHandler } from './handlers/booking-confirmed.handler';
import { BookingUpdatedWebhookHandler } from './handlers/booking-updated.handler';
import { TaskCompletedWebhookHandler } from './handlers/task-completed.handler';
import { WebhookService } from './webhooks.service';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook]), CqrsModule],
  providers: [
    WebhookService,
    EncryptionService,
    BookingConfirmedWebhookHandler,
    BookingUpdatedWebhookHandler,
    TaskCompletedWebhookHandler,
  ],
  exports: [WebhookService],
})
export class WebhooksModule {}
