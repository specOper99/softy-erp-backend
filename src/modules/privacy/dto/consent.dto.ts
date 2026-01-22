import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ConsentType } from '../entities/consent.entity';

export class GrantConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;

  @IsOptional()
  @IsString()
  policyVersion?: string;
}

export class RevokeConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;
}

export class ConsentResponseDto {
  type: ConsentType;
  granted: boolean;
  grantedAt: Date | null;
  revokedAt: Date | null;
  policyVersion: string | null;
}
