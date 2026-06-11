import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';

export class ListTenantsDto {
  @ApiPropertyOptional({ description: 'Search by name, slug, or billing email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TenantStatus, description: 'Filter by tenant status' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ enum: SubscriptionPlan, description: 'Filter by subscription plan' })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Minimum risk score filter' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minRiskScore?: number;

  @ApiPropertyOptional({ description: 'Filter tenants created after this date' })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional({ description: 'Filter tenants created before this date' })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100, description: 'Max results to return' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, description: 'Offset for pagination' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;
}

export class CreateTenantDto {
  @ApiPropertyOptional({ description: 'Tenant display name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Unique slug for subdomain' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan, default: SubscriptionPlan.FREE, description: 'Subscription plan' })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan = SubscriptionPlan.FREE;

  @ApiPropertyOptional({ description: 'Billing contact email' })
  @IsOptional()
  @IsString()
  billingEmail?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Tenant display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan, description: 'Subscription plan' })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Billing contact email' })
  @IsOptional()
  @IsString()
  billingEmail?: string;

  @ApiPropertyOptional({ description: 'Resource quotas' })
  @IsOptional()
  quotas?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Custom metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class SuspendTenantDto {
  @ApiPropertyOptional({ description: 'Reason for suspension', minLength: 10 })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Grace period in days before full suspension', default: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  gracePeriodDays?: number = 0;

  @ApiPropertyOptional({ description: 'Specific date/time to suspend until' })
  @IsOptional()
  @IsDateString()
  suspendUntil?: string;
}

export class ReactivateTenantDto {
  @ApiPropertyOptional({ description: 'Reason for reactivation', minLength: 10 })
  @IsString()
  reason: string;
}

export class DeleteTenantDto {
  @ApiPropertyOptional({ description: 'Reason for deletion (min 10 chars)', minLength: 10 })
  @ValidateIf((o) => !!o.reason)
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Specific date/time to schedule deletion' })
  @IsOptional()
  @IsDateString()
  scheduleFor?: string;
}
