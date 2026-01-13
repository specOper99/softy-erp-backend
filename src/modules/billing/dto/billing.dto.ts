import { IsBoolean, IsEmail, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { BillingInterval } from '../entities/subscription.entity';

export class CreateSubscriptionDto {
  @IsString()
  priceId: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @IsOptional()
  @IsBoolean()
  trialFromPlan?: boolean;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  priceId?: string;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class CreatePaymentMethodDto {
  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class CreateBillingCustomerDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export class CreateCheckoutSessionDto {
  @IsString()
  priceId: string;

  @IsString()
  successUrl: string;

  @IsString()
  cancelUrl: string;

  @IsOptional()
  @IsBoolean()
  allowPromotionCodes?: boolean;
}

export class CreatePortalSessionDto {
  @IsString()
  returnUrl: string;
}
