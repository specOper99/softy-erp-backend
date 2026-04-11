import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ConsentType } from '../entities/consent.entity';

export class GrantConsentDto {
  @ApiProperty({ enum: ConsentType, description: 'Type of consent to grant' })
  @IsEnum(ConsentType)
  type: ConsentType;

  @ApiPropertyOptional({ description: 'Policy version the user is consenting to' })
  @IsOptional()
  @IsString()
  policyVersion?: string;
}

export class RevokeConsentDto {
  @ApiProperty({ enum: ConsentType, description: 'Type of consent to revoke' })
  @IsEnum(ConsentType)
  type: ConsentType;
}

export class ConsentResponseDto {
  @ApiProperty({ enum: ConsentType })
  type: ConsentType;

  @ApiProperty()
  granted: boolean;

  @ApiPropertyOptional({ nullable: true })
  grantedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  revokedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  policyVersion: string | null;
}
