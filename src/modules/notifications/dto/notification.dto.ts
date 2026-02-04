import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { NotificationType } from '../enums/notification.enum';

export class CreateNotificationDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  userId?: string | null;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  clientId?: string | null;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  actionUrl?: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;
}

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty()
  read: boolean;

  @ApiPropertyOptional()
  readAt?: Date;

  @ApiPropertyOptional()
  actionUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class MarkAsReadDto {
  @ApiProperty()
  @IsBoolean()
  read: boolean;
}

export class NotificationFilterDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  read?: boolean;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number = 20;
}
