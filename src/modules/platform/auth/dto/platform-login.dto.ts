import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { PII } from '../../../../common/decorators';

export class PlatformLoginDto {
  @ApiProperty({ example: 'admin@test.com' })
  @IsEmail()
  @PII()
  email: string;

  @ApiProperty({ example: 'TestPassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @PII()
  password: string;

  @ApiPropertyOptional({ description: 'Device identifier for session tracking' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PlatformRefreshDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class PlatformTokensDto {
  @ApiProperty({ description: 'Short-lived access token' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived refresh token' })
  refreshToken: string;

  @ApiPropertyOptional({ description: 'Access token expiry in seconds' })
  expiresIn?: number;
}

export class PlatformAuthResponseDto {
  @ApiPropertyOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  refreshToken?: string;

  @ApiPropertyOptional()
  expiresIn?: number;

  @ApiPropertyOptional({
    description: 'Indicates MFA verification is required to complete login',
  })
  mfaRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Temporary MFA token (valid for 5 minutes)',
  })
  tempToken?: string;

  @ApiPropertyOptional()
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export class PlatformLogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
