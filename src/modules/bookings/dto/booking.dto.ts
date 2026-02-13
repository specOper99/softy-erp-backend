import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
