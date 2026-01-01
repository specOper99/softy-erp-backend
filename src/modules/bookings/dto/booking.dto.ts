import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';
import { BookingStatus } from '../../../common/enums';

export class CreateBookingDto {
  @ApiProperty({ description: 'Client ID' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ example: '2024-12-31T18:00:00Z' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({ description: 'Service package ID' })
  @IsUUID()
  packageId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  eventDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;
}

export class BookingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientId: string;

  @ApiPropertyOptional()
  client?: any; // Will be typed as ClientResponseDto if needed

  @ApiProperty()
  eventDate: Date;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty()
  totalPrice: number;

  @ApiProperty()
  packageId: string;

  @ApiPropertyOptional()
  notes: string;

  @ApiProperty()
  createdAt: Date;
}

export class ConfirmBookingResponseDto {
  @ApiProperty()
  booking: BookingResponseDto;

  @ApiProperty()
  tasksCreated: number;

  @ApiProperty()
  transactionId: string;
}
