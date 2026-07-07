import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { WithBookingFilterFields } from './booking-filter-fields.dto';

export enum BookingSortBy {
  CreatedAt = 'createdAt',
  EventDate = 'eventDate',
  TotalPrice = 'totalPrice',
}

export enum SortOrder {
  Asc = 'ASC',
  Desc = 'DESC',
}

export class BookingFilterDto extends WithBookingFilterFields(PaginationDto) {
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
