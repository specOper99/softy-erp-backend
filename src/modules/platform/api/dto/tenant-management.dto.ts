import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PII } from '../../../../common/decorators';
import { SubscriptionPlan } from '../../../tenants/domain/enums/subscription-plan.enum';
import { TenantStatus } from '../../../tenants/domain/enums/tenant-status.enum';

// Mirror of auth/dto RegisterDto password rules — keep platform-provisioned admins
// on the same security bar as self-registered users.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@$!%*?&)';

export class InitialAdminDto {
  @ApiProperty({ example: 'owner@acme.example', description: 'Email of the first tenant admin' })
  @IsEmail()
  @PII()
  email: string;

  @ApiProperty({
    example: 'MyPassword123!',
    minLength: 8,
    description:
      'Plaintext password supplied by the platform operator. Hashed with Argon2id before persistence; ' +
      'log a security warning at the call site so the plaintext is not retained.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  @PII()
  password: string;
}

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

  @ApiProperty({
    type: InitialAdminDto,
    description:
      'First tenant admin. A User with role=ADMIN is created in the same transaction as the tenant. ' +
      'Plaintext password is consumed by the service and not persisted or logged.',
  })
  @ValidateNested()
  @Type(() => InitialAdminDto)
  initialAdmin: InitialAdminDto;

  @ApiPropertyOptional({ description: 'Subscription start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  subscriptionStartedAt?: string;

  @ApiPropertyOptional({ description: 'Subscription end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  subscriptionEndsAt?: string;

  @ApiPropertyOptional({ description: 'Trial end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;
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

  @ApiPropertyOptional({
    description: 'Subscription start date (ISO 8601). Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o: UpdateTenantDto) => o.subscriptionStartedAt !== null)
  @IsDateString()
  subscriptionStartedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Subscription end date (ISO 8601). Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o: UpdateTenantDto) => o.subscriptionEndsAt !== null)
  @IsDateString()
  subscriptionEndsAt?: string | null;

  @ApiPropertyOptional({
    description: 'Trial end date (ISO 8601). Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o: UpdateTenantDto) => o.trialEndsAt !== null)
  @IsDateString()
  trialEndsAt?: string | null;
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
  @ValidateIf((o: DeleteTenantDto) => !!o.reason)
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Specific date/time to schedule deletion' })
  @IsOptional()
  @IsDateString()
  scheduleFor?: string;
}

export class CancelDeletionDto {
  @ApiPropertyOptional({
    description: 'Reason for cancelling scheduled deletion (optional when sent via query)',
    minLength: 10,
  })
  @ValidateIf((o: CancelDeletionDto) => o.reason !== undefined)
  @IsString()
  @MinLength(10)
  reason?: string;
}
