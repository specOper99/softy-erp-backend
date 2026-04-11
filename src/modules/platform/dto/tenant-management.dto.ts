import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';

export class ListTenantsDto {
  @ApiPropertyOptional({ description: 'Search by tenant name or slug' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, description: 'Minimum risk score (0-1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minRiskScore?: number;

  @ApiPropertyOptional({ description: 'Filter tenants created after this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional({ description: 'Filter tenants created before this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class CreateTenantDto {
  @ApiProperty({ description: 'Tenant display name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Unique URL-safe slug' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Billing contact email' })
  @IsEmail()
  @IsOptional()
  billingEmail?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Tenant display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Billing contact email' })
  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @ApiPropertyOptional({ description: 'Resource quotas override map' })
  @IsOptional()
  quotas?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Arbitrary metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class SuspendTenantDto {
  @ApiProperty({ description: 'Reason for suspension' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 90,
    default: 0,
    description: 'Grace period before suspension takes effect (days)',
  })
  @IsInt()
  @Min(0)
  @Max(90)
  @IsOptional()
  gracePeriodDays?: number = 0;

  @ApiPropertyOptional({ description: 'Suspend until this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  suspendUntil?: string;
}

export class ReactivateTenantDto {
  @ApiProperty({ description: 'Reason for reactivation' })
  @IsString()
  reason: string;
}

export class DeleteTenantDto {
  @ApiPropertyOptional({ description: 'Reason for deletion' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Schedule deletion for a future date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduleFor?: string;
}
