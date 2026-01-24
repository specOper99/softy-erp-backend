import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PII } from '../../../common/decorators';

// Password must have: 8+ chars, uppercase, lowercase, number, special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@$!%*?&)';

export class LoginDto {
  @ApiProperty({ example: 'admin@erp.soft-y.org' })
  @IsEmail()
  @PII()
  email: string;

  @ApiProperty({ example: 'MyPassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @PII()
  // Note: Don't apply regex validation on login - it reveals password rules
  password: string;

  @ApiPropertyOptional({ description: 'Extend session duration (30 days)' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@erp.soft-y.org' })
  @IsEmail()
  @PII()
  email: string;

  @ApiProperty({
    example: 'MyPassword123!',
    description: PASSWORD_MESSAGE,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  @PII()
  password: string;

  @ApiProperty({ example: 'Acme Studio' })
  @IsString()
  companyName: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}

export class TokensDto {
  @ApiProperty({ description: 'Short-lived access token (15 minutes)' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived refresh token (7 days)' })
  refreshToken: string;

  @ApiPropertyOptional({ description: 'Access token expiry in seconds' })
  expiresIn?: number;
}

export class AuthResponseDto {
  @ApiPropertyOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  refreshToken?: string;

  @ApiPropertyOptional()
  expiresIn?: number;

  @ApiPropertyOptional({
    description: 'Indicates MFA verification is required to complete login',
  })
  requiresMfa?: boolean;

  @ApiPropertyOptional({
    description: 'Temporary MFA token (valid for 5 minutes) used to verify TOTP or recovery code',
  })
  tempToken?: string;

  @ApiPropertyOptional()
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
  };
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke (optional, revokes current session)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'If true, revokes all sessions for this user',
  })
  @IsOptional()
  @IsBoolean()
  allSessions?: boolean;
}

export class RevokeOtherSessionsDto {
  @ApiProperty({ description: 'Current refresh token to keep (revoke all other sessions)' })
  @IsString()
  @IsNotEmpty()
  currentRefreshToken: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
