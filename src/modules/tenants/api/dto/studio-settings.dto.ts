import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export class WorkingHoursDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  day: DayOfWeek;

  @ApiProperty({ example: '09:00', description: 'Start time in HH:mm format' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '18:00', description: 'End time in HH:mm format' })
  @IsString()
  endTime: string;

  @ApiProperty({ description: 'Is this day a working day' })
  @IsBoolean()
  isOpen: boolean;
}

export class CancellationPolicyDto {
  @ApiProperty({ example: 7, description: 'Days before event' })
  @IsInt()
  @Min(0)
  daysBeforeEvent: number;

  @ApiProperty({ example: 100, description: 'Refund percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

export class BrandingDto {
  @ApiPropertyOptional({ description: 'Studio logo URL' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Primary brand color (hex)' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'Secondary brand color (hex)' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  secondaryColor?: string;

  @ApiPropertyOptional({ description: 'Accent color (hex)' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  accentColor?: string;
}

export class StudioSettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  timezone?: string;

  @ApiPropertyOptional({ type: [WorkingHoursDto] })
  workingHours?: WorkingHoursDto[];

  @ApiProperty({ type: [CancellationPolicyDto] })
  cancellationPolicy: CancellationPolicyDto[];

  @ApiPropertyOptional({ type: BrandingDto })
  branding?: BrandingDto;

  @ApiProperty()
  baseCurrency: string;

  @ApiProperty()
  defaultTaxRate: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  website?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UpdateStudioSettingsDto {
  @ApiPropertyOptional({ description: 'Studio display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Studio timezone (IANA format)', example: 'America/New_York' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: [WorkingHoursDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto[];

  @ApiPropertyOptional({ type: [CancellationPolicyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationPolicyDto)
  cancellationPolicy?: CancellationPolicyDto[];

  @ApiPropertyOptional({ type: BrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @ApiPropertyOptional({ description: 'Default tax rate percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultTaxRate?: number;

  @ApiPropertyOptional({ description: 'Studio description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Physical address' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
