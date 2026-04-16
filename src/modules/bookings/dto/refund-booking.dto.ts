import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SanitizeHtml } from '../../../common/decorators';

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
    example: 'E_PAYMENT',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
