import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '../tenants.enums';

export class CreateTenantDto {
  @ApiProperty({ description: 'Tenant display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique URL-safe slug identifier' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  subscriptionPlan?: SubscriptionPlan;
}
