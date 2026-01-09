import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference])],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService, NotificationsService],
  exports: [NotificationsService, NotificationPreferencesService],
})
export class NotificationsModule {}
