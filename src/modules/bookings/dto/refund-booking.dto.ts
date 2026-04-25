import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export class RefundBookingDto {
  @ApiProperty({ description: 'Refund amount (must not exceed total amount paid)', example: 100.0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Reason for the refund' })
  @IsOptional()
  @IsString()
  @SanitizeHtml()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Payment method used for the refund',
    enum: PaymentMethod,
    example: PaymentMethod.E_PAYMENT,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Date/time the refund was issued. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
