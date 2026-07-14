import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes, SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../../../common/decorators';
import { SkipTenant } from '../../../tenants/infrastructure/decorators/skip-tenant.decorator';
import {
  PlatformAuthResponseDto,
  PlatformLoginDto,
  PlatformLogoutDto,
  PlatformRefreshDto,
  PlatformTokensDto,
} from '../dto';
import { PlatformJwtAuthGuard } from '../../infrastructure/guards/platform-jwt-auth.guard';
import { PlatformAuthService } from '../../application/platform-auth.service';

@ApiTags('Platform Auth')
@Controller('platform/auth')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ short: true, medium: true, long: true })
@SkipTenant()
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Post('login')
  @SkipTenant()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform superadmin login' })
  @ApiBody({ type: PlatformLoginDto })
  @ApiOkResponse({ description: 'Login successful', type: PlatformAuthResponseDto })
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request, @Ip() ip: string): Promise<PlatformAuthResponseDto> {
    return this.platformAuthService.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Post('refresh')
  @SkipTenant()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh platform access token' })
  @ApiBody({ type: PlatformRefreshDto })
  @ApiOkResponse({ description: 'Token refresh successful', type: PlatformTokensDto })
  async refreshTokens(
    @Body() dto: PlatformRefreshDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<PlatformTokensDto> {
    return this.platformAuthService.refreshTokens(dto.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: ip,
    });
  }

  @Get('session')
  @UseGuards(PlatformJwtAuthGuard)
  @ApiBearerAuth('platform-auth')
  @ApiOperation({ summary: 'Get current platform user session' })
  @ApiOkResponse({ description: 'Session data' })
  async getSession(
    @CurrentUser() user: { id: string; email: string; role: string },
  ): Promise<{ user: { id: string; email: string; fullName: string; role: string } | null }> {
    const session = await this.platformAuthService.getSession(user.id);
    return { user: session };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PlatformJwtAuthGuard)
  @ApiBearerAuth('platform-auth')
  @ApiOperation({ summary: 'Logout platform user' })
  async logout(@CurrentUser() user: { id: string }, @Body() dto: PlatformLogoutDto): Promise<void> {
    await this.platformAuthService.logout(dto.refreshToken, user.id);
  }

  @Post('revoke-all-sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformJwtAuthGuard)
  @ApiBearerAuth('platform-auth')
  @ApiOperation({ summary: 'Revoke all platform sessions' })
  async revokeAllSessions(@CurrentUser() user: { id: string }): Promise<{ revokedSessions: number }> {
    const revoked = await this.platformAuthService.revokeAllSessions(user.id);
    return { revokedSessions: revoked };
  }
}
