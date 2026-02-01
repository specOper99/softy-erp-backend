import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationService } from './services/notification.service';
import { NotificationsService } from './services/notifications.service';
import { TicketingService } from './services/ticketing.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference, Notification])],
  controllers: [NotificationPreferencesController, NotificationsController],
  providers: [NotificationPreferencesService, NotificationsService, TicketingService, NotificationService],
  exports: [NotificationsService, NotificationPreferencesService, TicketingService, NotificationService],
})
export class NotificationsModule {}
