import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '../tenants.enums';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;
}
