import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';

export class CreateProcessingTypeDto {
  @ApiProperty({ description: 'Processing type name', example: 'Raw Edit' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  description?: string;

  @ApiPropertyOptional({ description: 'Sort order for display (lower = first)', default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Whether this type is selectable on bookings', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateProcessingTypeDto extends PartialType(CreateProcessingTypeDto) {}

export class ProcessingTypeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
