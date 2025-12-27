import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'admin@chapters.studio' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @MinLength(6)
    password: string;
}

export class RegisterDto {
    @ApiProperty({ example: 'user@chapters.studio' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123', minLength: 6 })
    @IsString()
    @MinLength(6)
    password: string;
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
    };
}

export class LogoutDto {
    @ApiPropertyOptional({ description: 'Refresh token to revoke (optional, revokes current session)' })
    refreshToken?: string;

    @ApiPropertyOptional({ description: 'If true, revokes all sessions for this user' })
    allSessions?: boolean;
}
