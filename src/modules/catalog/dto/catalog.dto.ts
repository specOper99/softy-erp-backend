import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

// ServicePackage DTOs
export class CreateServicePackageDto {
  @ApiProperty({ example: 'Wedding Package' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Complete wedding photography and video coverage',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}

export class UpdateServicePackageDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// TaskType DTOs
export class CreateTaskTypeDto {
  @ApiProperty({ example: 'Photography' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Event photography services' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultCommissionAmount: number;
}

export class UpdateTaskTypeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

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
export class ServicePackageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class TaskTypeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string;

  @ApiProperty()
  defaultCommissionAmount: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}
