import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';

export class UpdateSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan, description: 'New subscription plan' })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiProperty({ description: 'Reason for the subscription change' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'When the change should take effect (ISO 8601); defaults to immediately' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

export class IssueRefundDto {
  @ApiProperty({ description: 'Stripe invoice ID to refund' })
  @IsString()
  invoiceId: string;

  @ApiProperty({ description: 'Amount to refund (in major currency units)' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Reason for the refund' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyCreditDto {
  @ApiProperty({ description: 'Credit amount to apply (in major currency units)' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Reason for the credit' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Credit expiry date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class BillingReconciliationQueryDto {
  @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ minimum: 1, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 100;
}

export class RetryInvoiceDto {
  @ApiProperty({ description: 'Reason for retrying the invoice payment' })
  @IsString()
  reason: string;
}
