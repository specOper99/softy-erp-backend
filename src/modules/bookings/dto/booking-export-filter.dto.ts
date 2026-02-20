import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BookingStatus } from '../enums/booking-status.enum';

/**
 * Filter DTO for booking CSV export.
 *
 * When no filters are provided the export includes all bookings (current behavior).
 * When filters are provided the exported CSV is scoped to matching rows only.
 */
export class BookingExportFilterDto {
  @ApiPropertyOptional({
    description: 'Search term (client name, email, booking notes)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    isArray: true,
    description: 'Filter by booking status (multiple allowed)',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(BookingStatus, { each: true })
  @Type(() => String)
  status?: BookingStatus[];

  @ApiPropertyOptional({ description: 'Filter by start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by Package ID' })
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiPropertyOptional({ description: 'Filter by Client ID' })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
