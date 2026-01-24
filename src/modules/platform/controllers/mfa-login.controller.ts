import { Body, Controller, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { PlatformAuthService } from '../services/platform-auth.service';

class VerifyPlatformLoginMfaDto {
  @IsString()
  tempToken: string;

  @IsString()
  @MinLength(4)
  code: string;
}

interface PlatformRequest {
  ip?: string;
  connection?: { remoteAddress?: string };
  headers: { 'user-agent'?: string };
}

@ApiTags('Platform - MFA')
@SkipTenant()
@Controller('platform/mfa')
export class PlatformMfaLoginController {
  constructor(private readonly authService: PlatformAuthService) {}

  @Post('verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify MFA during platform login',
    description: 'Exchange a tempToken + MFA code for a full platform session token.',
  })
  @ApiResponse({ status: 200, description: 'MFA verification successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired temp token / MFA code' })
  async verifyLoginMfa(@Body() dto: VerifyPlatformLoginMfaDto, @Request() req: PlatformRequest) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    const userAgent: string = req.headers['user-agent'] ?? 'unknown';
    return this.authService.verifyLoginMfa(dto.tempToken, dto.code, ipAddress, userAgent);
  }
}
