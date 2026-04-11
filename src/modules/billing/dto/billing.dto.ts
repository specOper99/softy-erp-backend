import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BillingInterval } from '../entities/subscription.entity';

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'Stripe price ID' })
  @IsString()
  priceId: string;

  @ApiPropertyOptional({ description: 'Stripe payment method ID' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ enum: BillingInterval, description: 'Billing interval' })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional({ description: 'Use trial period from plan if available' })
  @IsOptional()
  @IsBoolean()
  trialFromPlan?: boolean;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Stripe price ID to switch to' })
  @IsOptional()
  @IsString()
  priceId?: string;

  @ApiPropertyOptional({ description: 'Cancel subscription at end of current period' })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class CreatePaymentMethodDto {
  @ApiProperty({ description: 'Stripe payment method ID' })
  @IsString()
  paymentMethodId: string;

  @ApiPropertyOptional({ description: 'Set as default payment method' })
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

/**
 * Nested address DTO for billing customer
 */
export class BillingAddressDto {
  @ApiPropertyOptional({ description: 'Address line 1' })
  @IsOptional()
  @IsString()
  line1?: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;
}

export class CreateBillingCustomerDto {
  @ApiPropertyOptional({ description: 'Customer email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Customer display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Billing address', type: BillingAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingAddressDto)
  address?: BillingAddressDto;
}

export class CreateCheckoutSessionDto {
  @ApiProperty({ description: 'Stripe price ID' })
  @IsString()
  priceId: string;

  @ApiProperty({ description: 'Redirect URL after successful checkout' })
  @IsString()
  successUrl: string;

  @ApiProperty({ description: 'Redirect URL if checkout is cancelled' })
  @IsString()
  cancelUrl: string;

  @ApiPropertyOptional({ description: 'Allow promotion codes during checkout' })
  @IsOptional()
  @IsBoolean()
  allowPromotionCodes?: boolean;
}

export class CreatePortalSessionDto {
  @ApiProperty({ description: 'URL to redirect to after portal session' })
  @IsString()
  returnUrl: string;
}
