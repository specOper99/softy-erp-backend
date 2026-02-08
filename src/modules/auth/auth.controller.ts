import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { minutes, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiErrorResponses, CurrentUser } from '../../common/decorators';
import { SkipTenant } from '../tenants/decorators/skip-tenant.decorator';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  EnableMfaDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  MfaResponseDto,
  MfaVerifyRecoveryDto,
  MfaVerifyTotpDto,
  RecoveryCodesResponseDto,
  RefreshTokenDto,
  RevokeOtherSessionsDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  TokensDto,
  VerifyEmailDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@ApiExtraModels(AuthResponseDto, TokensDto)
@ApiErrorResponses(
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
)
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation failed' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async register(@Body() registerDto: RegisterDto, @Req() req: Request, @Ip() ip: string): Promise<AuthResponseDto> {
    return this.authService.register(registerDto, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('login')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description: 'Stateless API login using credentials only. No CSRF token is required.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Login successful or MFA challenge required',
    schema: {
      oneOf: [
        {
          allOf: [
            { $ref: getSchemaPath(AuthResponseDto) },
            {
              properties: {
                requiresMfa: { type: 'boolean', example: true },
                tempToken: { type: 'string', example: 'a1b2c3d4e5f6...' },
              },
            },
          ],
        },
        { $ref: getSchemaPath(AuthResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests',
    headers: {
      'Retry-After': {
        description: 'Seconds to wait before retrying the request',
        schema: { type: 'string', example: '60' },
      },
    },
  })
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Ip() ip: string): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('refresh')
  @SkipTenant()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } }) // 10 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Token refresh successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async refreshTokens(@Body() dto: RefreshTokenDto, @Req() req: Request, @Ip() ip: string): Promise<TokensDto> {
    return this.authService.refreshTokens(dto.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@CurrentUser() user: User, @Body() dto: LogoutDto, @Req() req: Request): Promise<void> {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (dto.allSessions) {
      // If we are logging out all sessions, we still blacklist current access token
      if (accessToken) {
        await this.authService.logout(user.id, undefined, accessToken);
      }
      await this.authService.logoutAllSessions(user.id);
      return;
    }

    if (!dto.refreshToken) {
      throw new BadRequestException('refreshToken is required unless allSessions=true');
    }

    await this.authService.logout(user.id, dto.refreshToken, accessToken);
  }

  @Post('mfa/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate MFA secret and QR code' })
  async generateMfa(@CurrentUser() user: User): Promise<MfaResponseDto> {
    return this.authService.generateMfaSecret(user);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: minutes(5) } }) // 5 attempts per 5 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enable MFA with verification code',
    description: 'Returns recovery codes on success. Store these securely - they are shown only once!',
  })
  @ApiOkResponse({
    description: 'MFA enabled, recovery codes returned',
    schema: {
      allOf: [
        { $ref: getSchemaPath(RecoveryCodesResponseDto) },
        {
          properties: {
            codes: {
              type: 'array',
              items: { type: 'string', example: 'A1B2C3D4' },
            },
            remaining: { type: 'number', example: 10 },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async enableMfa(@CurrentUser() user: User, @Body() dto: EnableMfaDto): Promise<RecoveryCodesResponseDto> {
    const codes = await this.authService.enableMfa(user, dto.code);
    return {
      codes,
      remaining: codes.length,
    };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: minutes(5) } }) // 5 attempts per 5 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA' })
  async disableMfa(@CurrentUser() user: User): Promise<void> {
    return this.authService.disableMfa(user);
  }

  @Post('mfa/verify-totp')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify MFA using TOTP code',
    description: 'Complete login by verifying the authenticator app code.',
  })
  @ApiBody({ type: MfaVerifyTotpDto })
  @ApiOkResponse({ description: 'MFA verified, tokens returned', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired MFA session' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async verifyMfaTotp(@Body() dto: MfaVerifyTotpDto, @Req() req: Request, @Ip() ip: string): Promise<AuthResponseDto> {
    return this.authService.verifyMfaTotp(dto.tempToken, dto.code, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('mfa/verify-recovery')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify MFA using recovery code',
    description: 'Complete login by verifying a recovery code.',
  })
  @ApiBody({ type: MfaVerifyRecoveryDto })
  @ApiOkResponse({ description: 'MFA verified, tokens returned', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired MFA session' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async verifyMfaRecovery(
    @Body() dto: MfaVerifyRecoveryDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyMfaRecovery(dto.tempToken, dto.code, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Get('mfa/recovery-codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'View remaining recovery codes',
    description: 'Returns the number of remaining recovery codes and a warning if running low.',
  })
  @ApiResponse({ status: 200, description: 'Recovery codes status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRecoveryCodes(@CurrentUser() user: User): Promise<RecoveryCodesResponseDto> {
    const remaining = await this.authService.getRemainingRecoveryCodes(user);

    let warning: string | undefined;
    if (remaining <= 2 && remaining > 0) {
      warning = `Warning: Only ${remaining} recovery code${remaining === 1 ? '' : 's'} remaining. Consider regenerating.`;
    } else if (remaining === 0) {
      warning = 'No recovery codes available. Please regenerate immediately.';
    }

    return {
      codes: [], // Don't return actual codes for security
      remaining,
      warning,
    };
  }

  @Post('mfa/recovery-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: minutes(10) } }) // 3 attempts per 10 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate recovery codes',
    description:
      'Generates new recovery codes and invalidates old ones. Store these securely - they are shown only once!',
  })
  async regenerateRecoveryCodes(@CurrentUser() user: User): Promise<RecoveryCodesResponseDto> {
    const codes = await this.authService.generateRecoveryCodes(user);
    return {
      codes,
      remaining: codes.length,
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions for current user' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSessions(@CurrentUser() user: User) {
    const sessions = await this.authService.getActiveSessions(user.id);
    return sessions.map((s) => s.toSessionInfo());
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) sessionId: string): Promise<void> {
    await this.authService.revokeSession(user.id, sessionId);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all other sessions (keep current)' })
  @ApiBody({ type: RevokeOtherSessionsDto })
  async revokeOtherSessions(@CurrentUser() user: User, @Body() dto: RevokeOtherSessionsDto): Promise<void> {
    await this.authService.revokeOtherSessions(user.id, dto.currentRefreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'User info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getCurrentUser(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isMfaEnabled: user.isMfaEnabled,
    };
  }

  @Post('forgot-password')
  @SkipTenant()
  @Throttle({ default: { limit: 3, ttl: minutes(5) } }) // 3 attempts per 5 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Sends password reset email if account exists (always returns success)',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset email sent (masked)' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If an account exists, a password reset email has been sent',
    };
  }

  @Post('reset-password')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(15) } }) // 5 attempts per 15 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Resets password using token from email',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset successfully' };
  }

  @Post('verify-email')
  @SkipTenant()
  @Throttle({ default: { limit: 10, ttl: minutes(5) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email verified successfully' };
  }

  @Post('resend-verification')
  @SkipTenant()
  @Throttle({ default: { limit: 3, ttl: minutes(10) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    await this.authService.resendVerificationEmail(dto.email);
    return {
      message: 'If the account exists and is unverified, a verification email has been sent',
    };
  }
}
