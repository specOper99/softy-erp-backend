import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class ForcePasswordResetDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean = true;
}

export class RevokeSessionsDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean = true;
}

export class UpdateIpAllowlistDto {
  @IsArray()
  @IsString({ each: true })
  ipAddresses: string[];

  @IsString()
  reason: string;
}

export class InitiateDataExportDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dataCategories?: string[];

  @IsString()
  reason: string;
}

export class InitiateDataDeletionDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsBoolean()
  hardDelete?: boolean = false;
}

export class UpdateSecurityPolicyDto {
  @IsString()
  policyKey: string;

  @IsObject()
  policyValue: Record<string, unknown>;

  @IsString()
  reason: string;
}
