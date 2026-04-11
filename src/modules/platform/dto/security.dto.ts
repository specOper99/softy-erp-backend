import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class ForcePasswordResetDto {
  @ApiProperty({ description: 'Reason for forcing password reset' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ default: true, description: 'Send notification email to user' })
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean = true;
}

export class RevokeSessionsDto {
  @ApiProperty({ description: 'Reason for revoking sessions' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ default: true, description: 'Send notification email to user' })
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean = true;
}

export class UpdateIpAllowlistDto {
  @ApiProperty({ type: [String], description: 'List of allowed IP addresses or CIDR ranges' })
  @IsArray()
  @IsString({ each: true })
  ipAddresses: string[];

  @ApiProperty({ description: 'Reason for updating the IP allowlist' })
  @IsString()
  reason: string;
}

export class InitiateDataExportDto {
  @ApiPropertyOptional({ type: [String], description: 'Data categories to export (all if omitted)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dataCategories?: string[];

  @ApiProperty({ description: 'Reason for initiating data export' })
  @IsString()
  reason: string;
}

export class InitiateDataDeletionDto {
  @ApiProperty({ description: 'Reason for initiating data deletion' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ default: false, description: 'Perform a hard (irreversible) deletion' })
  @IsOptional()
  @IsBoolean()
  hardDelete?: boolean = false;
}

export class UpdateSecurityPolicyDto {
  @ApiProperty({ description: 'Policy key to update' })
  @IsString()
  policyKey: string;

  @ApiProperty({ description: 'New policy value (arbitrary JSON object)' })
  @IsObject()
  policyValue: Record<string, unknown>;

  @ApiProperty({ description: 'Reason for the policy change' })
  @IsString()
  reason: string;
}
