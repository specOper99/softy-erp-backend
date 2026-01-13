import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators';
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
  RecoveryCodesResponseDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  TokensDto,
  VerifyEmailDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // 5 attempts per minute
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(@Body() registerDto: RegisterDto, @Req() req: Request, @Ip() ip: string): Promise<AuthResponseDto> {
    return this.authService.register(registerDto, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('login')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // 5 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  async logout(@CurrentUser() user: User, @Body() dto: LogoutDto, @Req() req: Request): Promise<void> {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    // If we are logging out all sessions, we still blacklist current access token
    if (accessToken) {
      await this.authService.logout(user.id, undefined, accessToken);
    }

    if (dto.allSessions) {
      await this.authService.logoutAllSessions(user.id);
    } else {
      await this.authService.logout(user.id, dto.refreshToken, accessToken);
    }
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

  @Get('mfa/recovery-codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'View remaining recovery codes',
    description: 'Returns the number of remaining recovery codes and a warning if running low.',
  })
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
  async getSessions(@CurrentUser() user: User) {
    const sessions = await this.authService.getActiveSessions(user.id);
    return sessions.map((s) => s.toSessionInfo());
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(@CurrentUser() user: User, @Param('id') sessionId: string): Promise<void> {
    await this.authService.revokeSession(user.id, sessionId);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all other sessions (keep current)' })
  async revokeOtherSessions(@CurrentUser() user: User, @Body() dto: { currentRefreshToken: string }): Promise<void> {
    await this.authService.revokeOtherSessions(user.id, dto.currentRefreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
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
