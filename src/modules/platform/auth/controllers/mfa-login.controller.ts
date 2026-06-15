import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { minutes, SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SkipTenant } from '../../../tenants/decorators/skip-tenant.decorator';
import { MFAVerifyLoginDto, PlatformAuthResponseDto } from '../dto';
import { PlatformAuthService } from '../services/platform-auth.service';

@ApiTags('Platform - MFA Login')
@Controller('platform/mfa')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ short: true, medium: true, long: true })
@SkipTenant()
export class MfaLoginController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Post('verify-login')
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA code during platform login' })
  @ApiBody({ type: MFAVerifyLoginDto })
  @ApiOkResponse({ description: 'MFA verification successful, tokens issued', type: PlatformAuthResponseDto })
  async verifyLogin(@Body() dto: MFAVerifyLoginDto, @Req() req: Request): Promise<PlatformAuthResponseDto> {
    const context = {
      userAgent: req.headers['user-agent'] || undefined,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
    };

    return this.platformAuthService.verifyMfaLogin(dto.tempToken, dto.code, context);
  }
}
