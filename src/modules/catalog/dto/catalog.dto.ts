import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
  override durationMinutes: number;

  @ApiProperty({ example: 2, description: 'Minimum staff required for delivery' })
  @IsInt()
  @Min(1)
  override requiredStaffCount: number;

  @ApiProperty({ example: 'REV-SERVICES' })
  @IsString()
  @IsNotEmpty()
  override revenueAccountCode: string;
}

export class UpdateServicePackageDto extends PartialType(BaseServicePackageDto) {}

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
  override durationMinutes: number;

  @ApiProperty()
  override requiredStaffCount: number;

  @ApiProperty()
  override revenueAccountCode: string;

  @ApiProperty()
  createdAt: Date;
}
