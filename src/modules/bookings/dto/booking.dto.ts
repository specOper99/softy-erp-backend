import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
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

  @ApiPropertyOptional({ enum: BookingStatus })
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

  @ApiProperty({ enum: BookingStatus })
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
