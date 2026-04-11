import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ description: 'Platform admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Platform admin password' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ description: 'TOTP MFA code (required if MFA is enabled)' })
  @IsOptional()
  @IsString()
  mfaCode?: string;

  @ApiPropertyOptional({ maxLength: 255, description: 'Stable device identifier for session tracking' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @ApiPropertyOptional({ maxLength: 255, description: 'Human-readable device name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;
}

export class PlatformRefreshDto {
  @ApiProperty({ description: 'Platform refresh token' })
  @IsString()
  refreshToken: string;
}

export class PlatformRevokeAllSessionsDto {
  @ApiProperty({ minLength: 10, description: 'Reason for revoking all sessions (audit trail)' })
  @IsString()
  @MinLength(10)
  reason: string;
}
