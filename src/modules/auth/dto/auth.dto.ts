import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

// Password must have: 8+ chars, uppercase, lowercase, number, special char
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@$!%*?&)';

export class LoginDto {
  @ApiProperty({ example: 'admin@chapters.studio' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MyPassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  // Note: Don't apply regex validation on login - it reveals password rules
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@chapters.studio' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'MyPassword123!',
    description: PASSWORD_MESSAGE,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
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
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiPropertyOptional()
  expiresIn?: number;

  @ApiProperty()
  user: {
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
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'If true, revokes all sessions for this user',
  })
  allSessions?: boolean;
}
