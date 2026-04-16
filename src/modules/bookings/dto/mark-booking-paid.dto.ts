import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export class MarkBookingPaidDto {
  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.E_PAYMENT })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Receipt #A-102' })
  @IsOptional()
  @IsString()
  reference?: string;
}
