import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '../enums/notification.enum';
import { NotificationPreferencesService } from './notification-preferences.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly preferencesService: NotificationPreferencesService) {}

  async shouldSendEmail(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.preferencesService.getPreference(userId, type);
    // Default to true if no preference set
    return pref ? pref.emailEnabled : true;
  }

  async shouldSendInApp(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.preferencesService.getPreference(userId, type);
    // Default to true if no preference set
    return pref ? pref.inAppEnabled : true;
  }
}
