import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { BookingStatus } from '../enums/booking-status.enum';

/**
 * Cursor-based pagination DTO with booking filter fields.
 *
 * Mirrors the filter fields from {@link BookingFilterDto} but extends
 * cursor pagination instead of offset pagination.
 */
export class BookingCursorFilterDto extends CursorPaginationDto {
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
