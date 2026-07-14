import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BookingStatus } from '../../domain/enums/booking-status.enum';

// Mixin base must accept arbitrary constructor args (NestJS mapped-type pattern).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

export function WithBookingFilterFields<TBase extends Constructor>(Base: TBase) {
  class BookingFilterFieldsHost extends Base {
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

  return BookingFilterFieldsHost;
}

class BookingFilterFieldsDtoBase {}

export class BookingFilterFieldsDto extends WithBookingFilterFields(BookingFilterFieldsDtoBase) {}
