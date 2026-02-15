import { Body, Controller, HttpCode, HttpStatus, Logger, Post, Request, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { PlatformLoginDto, PlatformRevokeAllSessionsDto } from '../dto/platform-auth.dto';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformAuthService } from '../services/platform-auth.service';

interface PlatformRequest {
  ip?: string;
  connection?: { remoteAddress?: string };
  headers: { 'user-agent'?: string };
  user: {
    sessionId: string;
    userId: string;
  };
}

/**
 * Controller for platform authentication
 */
@ApiTags('Platform - Auth')
@Controller('platform/auth')
@SkipTenant()
export class PlatformAuthController {
  private readonly logger = new Logger(PlatformAuthController.name);

  constructor(private readonly authService: PlatformAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Platform admin login',
    description: `Authenticate a platform administrator. MFA is mandatory for all platform users.
    
**Required Role:** None (public endpoint)

**Flow:**
1. Submit email/password
2. If MFA enabled, receive \`requiresMfa: true\` with \`tempToken\`
3. Use \`/platform/mfa/verify-login\` with the tempToken and TOTP code`,
  })
  @ApiBody({ type: PlatformLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful or MFA required',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 423, description: 'Account locked due to failed attempts' })
  async login(@Body() dto: PlatformLoginDto, @Request() req: PlatformRequest) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    const userAgent: string = req.headers['user-agent'] ?? 'unknown';

    const emailHash = createHash('sha256').update(dto.email).digest('hex').slice(0, 12);
    this.logger.log(`Platform login attempt for email hash: ${emailHash} (ip: ${ipAddress}, ua: ${userAgent})`);

    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(PlatformJwtAuthGuard, PlatformContextGuard)
  @RequireContext(ContextType.PLATFORM)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('platform-auth')
  @ApiOperation({
    summary: 'Platform admin logout',
    description: 'End the current platform session and invalidate the token.',
  })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Request() req: PlatformRequest) {
    const { sessionId, userId } = req.user;
    await this.authService.logout(sessionId, userId);
    this.logger.log(`Platform user ${userId} logged out`);
  }

  @Post('revoke-all-sessions')
  @UseGuards(PlatformJwtAuthGuard, PlatformContextGuard)
  @RequireContext(ContextType.PLATFORM)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('platform-auth')
  @ApiOperation({
    summary: 'Revoke all sessions',
    description: 'Revoke all active sessions for the current platform user. Useful for security incidents.',
  })
  @ApiResponse({ status: 200, description: 'Sessions revoked' })
  async revokeAllSessions(@Request() req: PlatformRequest, @Body() dto: PlatformRevokeAllSessionsDto) {
    const { userId } = req.user;
    const count = await this.authService.revokeAllSessions(userId, userId, dto.reason);
    return { revokedSessions: count };
  }
}
