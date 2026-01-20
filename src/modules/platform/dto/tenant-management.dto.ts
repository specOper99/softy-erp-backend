import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';

export class ListTenantsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minRiskScore?: number;

  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @IsOptional()
  quotas?: Record<string, number>;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class SuspendTenantDto {
  @IsString()
  reason: string;

  @IsInt()
  @Min(0)
  @Max(90)
  @IsOptional()
  gracePeriodDays?: number = 0;

  @IsOptional()
  @IsDateString()
  suspendUntil?: string;
}

export class ReactivateTenantDto {
  @IsString()
  reason: string;
}

export class DeleteTenantDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsDateString()
  scheduleFor?: string;
}
