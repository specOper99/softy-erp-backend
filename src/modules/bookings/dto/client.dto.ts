import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';

export class CreateClientDto {
  @ApiProperty({ description: 'Client full name', example: 'Ahmed Ali' })
  @IsString()
  @IsNotEmpty()
  @SanitizeHtml()
  name: string;

  @ApiProperty({ description: 'Client email address', example: 'ahmed@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Client phone number', example: '+9647701234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Optional notes about the client' })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;
}

export class UpdateClientTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiProperty({
    example: ['VIP', 'Wedding', 'Corporate'],
    description: 'Array of tags for client categorization',
  })
  tags: string[];
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiProperty({ required: false, description: 'Client name' })
  name?: string;

  @IsEmail()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Client email address' })
  email?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Client phone number' })
  phone?: string;

  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiProperty({ required: false, description: 'Notes about the client' })
  notes?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiProperty({
    required: false,
    example: ['VIP', 'Wedding', 'Corporate'],
    description: 'Array of tags for client categorization',
  })
  tags?: string[];

  @IsOptional()
  @ApiProperty({
    required: false,
    description: 'Notification preferences for the client portal',
    example: { email: true, inApp: true },
  })
  notificationPreferences?: {
    email: boolean;
    inApp: boolean;
    marketing?: boolean;
    reminders?: boolean;
    updates?: boolean;
  };
}
