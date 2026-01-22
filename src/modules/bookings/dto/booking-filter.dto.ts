import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BookingStatus } from '../enums/booking-status.enum';

export enum BookingSortBy {
  CreatedAt = 'createdAt',
  EventDate = 'eventDate',
  TotalPrice = 'totalPrice',
}

export enum SortOrder {
  Asc = 'ASC',
  Desc = 'DESC',
}

export class BookingFilterDto extends PaginationDto {
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
  @Type(() => String) // Ensures transformation if needed, though strictly query params handling varies
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

  @ApiPropertyOptional({ description: 'Minimum Total Price' })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum Total Price' })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Sort field (createdAt, eventDate, totalPrice)',
    enum: BookingSortBy,
  })
  @IsOptional()
  @IsEnum(BookingSortBy)
  sortBy?: BookingSortBy;

  @ApiPropertyOptional({
    description: 'Sort order (ASC, DESC)',
    enum: SortOrder,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
