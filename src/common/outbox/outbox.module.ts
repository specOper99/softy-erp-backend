import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { areBackgroundJobsEnabled } from '../queue/background-jobs.runtime';
import { ConsumerInbox } from '../entities/consumer-inbox.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { OUTBOX_EVENTS_QUEUE } from '../events/outbox-envelope';
import { ConsumerInboxService } from '../services/consumer-inbox.service';
import { OutboxEventProcessor, OutboxRelayService } from '../services/outbox-relay.service';
import { AnalyticsModule } from '../../modules/analytics/analytics.module';
import { MailModule } from '../../modules/mail/mail.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { WebhooksModule } from '../../modules/webhooks/webhooks.module';

const backgroundJobsEnabled = areBackgroundJobsEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, ConsumerInbox]),
    forwardRef(() => NotificationsModule),
    forwardRef(() => MailModule),
    forwardRef(() => WebhooksModule),
    forwardRef(() => AnalyticsModule),
    ...(backgroundJobsEnabled
      ? [
          BullModule.registerQueue({
            name: OUTBOX_EVENTS_QUEUE,
            defaultJobOptions: {
              attempts: 5,
              backoff: { type: 'exponential', delay: 1_000 },
              removeOnComplete: true,
            },
          }),
        ]
      : []),
  ],
  providers: [OutboxRelayService, ConsumerInboxService, ...(backgroundJobsEnabled ? [OutboxEventProcessor] : [])],
  exports: [OutboxRelayService, ConsumerInboxService, TypeOrmModule],
})
export class OutboxModule {}
