import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

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
}
