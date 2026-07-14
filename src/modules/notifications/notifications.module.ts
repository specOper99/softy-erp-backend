import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OUTBOX_NOTIFICATION_CONSUMER } from '../../common/outbox/outbox-consumer.port';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { UsersModule } from '../users/users.module';
import { NotificationPreferencesController } from './api/notification-preferences.controller';
import { NotificationsController } from './api/notifications.controller';
import { BookingCreatedNotificationHandler } from './application/booking-created.handler';
import { BookingCompletedNotificationHandler } from './application/booking-completed.handler';
import { NotificationPreferencesService } from './application/notification-preferences.service';
import { NotificationService } from './application/notification.service';
import { NotificationsService } from './application/notifications.service';
import { TaskAssignedNotificationHandler } from './application/task-assigned.handler';
import { TaskCompletedNotificationHandler } from './application/task-completed.handler';
import { TicketingService } from './application/ticketing.service';
import { OutboxNotificationConsumer } from './consumers/outbox-notification.consumer';
import { NotificationPreference, Notification } from './domain/entities';
import { NotificationPreferenceRepository } from './infrastructure/notification-preference.repository';
import { NotificationRepository } from './infrastructure/notification.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference, Notification]),
    CqrsModule,
    UsersModule,
    forwardRef(() => OutboxModule),
  ],
  controllers: [NotificationPreferencesController, NotificationsController],
  providers: [
    NotificationPreferencesService,
    NotificationsService,
    TicketingService,
    NotificationService,
    NotificationRepository,
    NotificationPreferenceRepository,
    BookingCreatedNotificationHandler,
    BookingCompletedNotificationHandler,
    TaskAssignedNotificationHandler,
    TaskCompletedNotificationHandler,
    OutboxNotificationConsumer,
    {
      provide: OUTBOX_NOTIFICATION_CONSUMER,
      useExisting: OutboxNotificationConsumer,
    },
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    TicketingService,
    NotificationService,
    NotificationRepository,
    OUTBOX_NOTIFICATION_CONSUMER,
  ],
})
export class NotificationsModule {}
