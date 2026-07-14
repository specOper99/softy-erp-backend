import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../../../../common/decorators';

export class ClientResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone2?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CreateClientDto {
  @ApiProperty({ example: 'Ahmed Ali' })
  @IsString()
  @IsNotEmpty()
  @SanitizeHtml()
  name: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+9647701234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: '+9647709876543' })
  @IsString()
  @IsOptional()
  phone2?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;
}

export class UpdateClientTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ApiProperty({ example: ['VIP', 'Wedding', 'Corporate'] })
  tags: string[];
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiPropertyOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  phone2?: string;

  @IsString()
  @IsOptional()
  @SanitizeHtml()
  @ApiPropertyOptional()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  @ApiPropertyOptional({ example: ['VIP', 'Wedding', 'Corporate'] })
  tags?: string[];

  @ApiPropertyOptional({ example: { email: true, inApp: true } })
  @IsOptional()
  notificationPreferences?: {
    email?: boolean;
    inApp?: boolean;
    marketing?: boolean;
    reminders?: boolean;
    updates?: boolean;
  };
}
