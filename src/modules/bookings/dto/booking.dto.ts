import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { BookingStatus } from '../enums/booking-status.enum';

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

  @ApiPropertyOptional({ description: 'Start time in HH:mm format', example: '14:30' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, {
    message: 'startTime must be in HH:mm format',
  })
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ description: 'Tax rate override (0-50%)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(50)
  taxRate?: number;

  @ApiPropertyOptional({
    description: 'Deposit percentage (0-100)',
    example: 25,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  depositPercentage?: number;
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

  @ApiPropertyOptional({ description: 'Start time in HH:mm format', example: '14:30' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, {
    message: 'startTime must be in HH:mm format',
  })
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @SanitizeHtml()
  notes?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description:
      'Booking lifecycle: DRAFT=request, CONFIRMED=accepted request, COMPLETED=service delivered, CANCELLED=cancelled/rejected',
  })
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;
}

export class RescheduleBookingDto {
  @ApiProperty({ example: '2024-12-31T18:00:00Z' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({ description: 'Start time in HH:mm format', example: '14:30' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;
}

export class ClientResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional()
  notes?: string;
}

export class BookingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientId: string;

  @ApiPropertyOptional({ type: ClientResponseDto })
  client?: ClientResponseDto;

  @ApiProperty()
  eventDate: Date;

  @ApiPropertyOptional({ description: 'Start time in HH:mm format', example: '14:30' })
  startTime?: string | null;

  @ApiProperty({ description: 'Snapshot of package duration in minutes', example: 120 })
  durationMinutes: number;

  @ApiProperty({
    enum: BookingStatus,
    description:
      'Booking lifecycle: DRAFT=request, CONFIRMED=accepted request, COMPLETED=service delivered, CANCELLED=cancelled/rejected',
  })
  status: BookingStatus;

  @ApiProperty()
  totalPrice: number;

  @ApiProperty({ description: 'Deposit percentage' })
  depositPercentage: number;

  @ApiProperty({ description: 'Calculated deposit amount' })
  depositAmount: number;

  @ApiProperty({ description: 'Total amount paid so far' })
  amountPaid: number;

  @ApiProperty({ enum: PaymentStatus, description: 'Payment status' })
  paymentStatus: PaymentStatus;

  @ApiProperty()
  subTotal: number;

  @ApiProperty()
  taxRate: number;

  @ApiProperty()
  taxAmount: number;

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

export enum BookingAvailabilityConflictCode {
  StaffConflict = 'BOOKING_STAFF_CONFLICT',
}

export class BookingAvailabilityQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Service package ID to evaluate' })
  @IsUUID()
  packageId: string;

  @ApiProperty({
    description: 'Booking date (ISO 8601 date-time or date)',
    example: '2026-02-20T00:00:00.000Z',
  })
  @IsDateString()
  eventDate: string;

  @ApiProperty({ description: 'Requested start time in HH:mm format', example: '14:30' })
  @Matches(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiPropertyOptional({
    description: 'Optional duration override in minutes (falls back to package duration when omitted)',
    minimum: 1,
    example: 120,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exclude an existing booking (useful during reschedule checks)',
  })
  @IsOptional()
  @IsUUID()
  excludeBookingId?: string;
}

export class BookingAvailabilityConflictReasonDto {
  @ApiProperty({ enum: BookingAvailabilityConflictCode })
  code: BookingAvailabilityConflictCode;

  @ApiProperty({ description: 'Human-readable reason' })
  message: string;

  @ApiProperty({
    description: 'Conflict details payload',
    example: {
      requiredStaffCount: 3,
      eligibleCount: 4,
      busyCount: 2,
      availableCount: 2,
    },
  })
  details: {
    requiredStaffCount: number;
    eligibleCount: number;
    busyCount: number;
    availableCount: number;
  };
}

export class BookingAvailabilityResponseDto {
  @ApiProperty({ description: 'True when requested window is available' })
  available: boolean;

  @ApiProperty({
    type: [BookingAvailabilityConflictReasonDto],
    description: 'List of blocking conflicts; empty when available=true',
  })
  conflictReasons: BookingAvailabilityConflictReasonDto[];
}
