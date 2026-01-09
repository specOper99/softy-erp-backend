import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import {
  NotificationFrequency,
  NotificationType,
} from '../enums/notification.enum';

export class UpdateNotificationPreferenceDto {
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  inAppEnabled?: boolean;

  @IsEnum(NotificationFrequency)
  @IsOptional()
  frequency?: NotificationFrequency;
}
