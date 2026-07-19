import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../../../../common/enums/payment-method.enum';

export class RecordPaymentDto {
  @ApiProperty({ description: 'Payment amount', example: 250.0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description: 'Way of receiving money',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Payment reference or transaction ID' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Date/time the payment was received. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @ApiPropertyOptional({
    description:
      'Idempotency key unique per tenant (16-256 chars, alphanumeric/hyphen/underscore). Replays return without double-charging.',
    example: 'pay-booking-abc-001',
  })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey?: string;
}
