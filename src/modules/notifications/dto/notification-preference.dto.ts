import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { NotificationFrequency, NotificationType } from '../enums/notification.enum';

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NotificationType, description: 'Notification type to configure' })
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @ApiPropertyOptional({ description: 'Enable or disable email delivery for this type' })
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable or disable in-app delivery for this type' })
  @IsBoolean()
  @IsOptional()
  inAppEnabled?: boolean;

  @ApiPropertyOptional({ enum: NotificationFrequency, description: 'Digest frequency for email delivery' })
  @IsEnum(NotificationFrequency)
  @IsOptional()
  frequency?: NotificationFrequency;
}
