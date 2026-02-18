import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators/sanitize-html.decorator';

// Base DTOs
export class BaseServicePackageDto {
  @ApiProperty({ example: 'Wedding Package' })
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'Complete wedding photography and video coverage',
  })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  description?: string;

  @ApiProperty({ example: 1500.0 })
  @ApiPropertyOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 120, description: 'Package duration in minutes' })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 2, description: 'Minimum staff required for delivery' })
  @IsInt()
  @Min(1)
  @IsOptional()
  requiredStaffCount?: number;

  @ApiPropertyOptional({ example: 'REV-SERVICES' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  revenueAccountCode?: string;
}

export class BaseTaskTypeDto {
  @ApiProperty({ example: 'Photography' })
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Event photography services' })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  description?: string;

  @ApiProperty({ example: 100.0 })
  @ApiPropertyOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  defaultCommissionAmount?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ServicePackage DTOs
export class CreateServicePackageDto extends OmitType(BaseServicePackageDto, ['name', 'price'] as const) {
  @ApiProperty({ example: 'Wedding Package' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 120, description: 'Package duration in minutes' })
  @IsInt()
  @Min(1)
  durationMinutes: number;

  @ApiProperty({ example: 2, description: 'Minimum staff required for delivery' })
  @IsInt()
  @Min(1)
  requiredStaffCount: number;

  @ApiProperty({ example: 'REV-SERVICES' })
  @IsString()
  @IsNotEmpty()
  revenueAccountCode: string;
}

export class UpdateServicePackageDto extends PartialType(BaseServicePackageDto) {}

// TaskType DTOs
export class CreateTaskTypeDto extends OmitType(BaseTaskTypeDto, ['name', 'defaultCommissionAmount'] as const) {
  @ApiProperty({ example: 'Photography' })
  @IsString()
  name: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultCommissionAmount: number;
}

export class UpdateTaskTypeDto extends PartialType(BaseTaskTypeDto) {}

// PackageItem DTOs
export class CreatePackageItemDto {
  @ApiProperty()
  @IsUUID()
  taskTypeId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class AddPackageItemsDto {
  @ApiProperty({ type: [CreatePackageItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackageItemDto)
  items: CreatePackageItemDto[];
}

// Response DTOs
export class ServicePackageResponseDto extends OmitType(BaseServicePackageDto, ['name', 'price', 'isActive'] as const) {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty()
  requiredStaffCount: number;

  @ApiProperty()
  revenueAccountCode: string;

  @ApiProperty()
  createdAt: Date;
}

export class TaskTypeResponseDto extends OmitType(BaseTaskTypeDto, [
  'name',
  'defaultCommissionAmount',
  'isActive',
] as const) {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  defaultCommissionAmount: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}
