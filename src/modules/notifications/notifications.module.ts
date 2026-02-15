import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { BookingCreatedNotificationHandler } from './handlers/booking-created.handler';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationService } from './services/notification.service';
import { NotificationsService } from './services/notifications.service';
import { TicketingService } from './services/ticketing.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference, Notification]), CqrsModule, UsersModule],
  controllers: [NotificationPreferencesController, NotificationsController],
  providers: [
    NotificationPreferencesService,
    NotificationsService,
    TicketingService,
    NotificationService,
    NotificationRepository,
    NotificationPreferenceRepository,
    BookingCreatedNotificationHandler,
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    TicketingService,
    NotificationService,
    NotificationRepository,
  ],
})
export class NotificationsModule {}
