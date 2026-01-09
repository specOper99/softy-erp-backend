import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateNotificationPreferenceDto } from '../dto/notification-preference.dto';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationType } from '../enums/notification.enum';

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
  ) {}

  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    const preferences = await this.preferenceRepo.find({ where: { userId } });

    // If user has no preferences for some types, return defaults (or create them lazily)
    // For now, let's just return what's in DB. The UI/Logic can handle defaults.
    // Alternatively, we can ensure all types are present here.
    return preferences;
  }

  async updatePreferences(
    userId: string,
    updates: UpdateNotificationPreferenceDto[],
  ) {
    // Process bulk updates
    const results = [];
    for (const update of updates) {
      let pref = await this.preferenceRepo.findOne({
        where: { userId, notificationType: update.notificationType },
      });

      if (!pref) {
        pref = this.preferenceRepo.create({
          userId,
          notificationType: update.notificationType,
        });
      }

      if (update.emailEnabled !== undefined)
        pref.emailEnabled = update.emailEnabled;
      if (update.inAppEnabled !== undefined)
        pref.inAppEnabled = update.inAppEnabled;
      if (update.frequency !== undefined) pref.frequency = update.frequency;

      results.push(await this.preferenceRepo.save(pref));
    }
    return results;
  }

  async getPreference(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationPreference | null> {
    return this.preferenceRepo.findOne({
      where: { userId, notificationType: type },
    });
  }
}
