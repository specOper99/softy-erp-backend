import { PartialType } from '@nestjs/swagger';
import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { CreateTenantDto } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @IsUUID()
  @IsOptional()
  parentTenantId?: string;

  @IsObject()
  @IsOptional()
  quotas?: Record<string, number>;
}
