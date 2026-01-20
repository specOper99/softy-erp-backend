import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @IsString()
  reason: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

export class IssueRefundDto {
  @IsString()
  invoiceId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyCreditDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class BillingReconciliationQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 100;
}

export class RetryInvoiceDto {
  @IsString()
  reason: string;
}
