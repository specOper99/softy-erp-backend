import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';

import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { EndImpersonationDto, StartImpersonationDto } from '../dto/support.dto';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { ImpersonationService } from '../services/impersonation.service';

interface PlatformSupportRequest {
  ip: string;
  headers: { 'user-agent'?: string };
  user: {
    userId: string;
  };
}

/**
 * Platform controller for support operations including impersonation
 */
@ApiTags('Platform - Support')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/support')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformSupportController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  @Post('impersonate')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_IMPERSONATE)
  @ApiOperation({
    summary: 'Start impersonation session',
    description: `Impersonate a tenant user for support purposes. All actions are logged.

**Required Permission:** \`platform:support:impersonate\`
**Allowed Roles:** SUPER_ADMIN, SUPPORT_ADMIN

**⚠️ Security Notes:**
- Session expires after 4 hours
- All actions during impersonation are logged
- A reason is required for audit trail
- Consider providing an approval ticket ID for compliance`,
  })
  @ApiResponse({
    status: 201,
    description: 'Impersonation session started',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', format: 'uuid' },
        token: { type: 'string', description: 'JWT for impersonated user' },
        expiresIn: { type: 'string', example: '4h' },
        targetUser: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
          },
        },
        warning: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Active session already exists' })
  async startImpersonation(@Body() dto: StartImpersonationDto, @Req() req: PlatformSupportRequest) {
    const result = await this.impersonationService.startImpersonation(
      dto,
      req.user.userId,
      req.ip,
      req.headers['user-agent'] ?? 'unknown',
    );

    return {
      sessionId: result.session.id,
      token: result.token,
      expiresIn: '4h',
      targetUser: {
        id: result.session.targetUserId,
        email: result.session.targetUserEmail,
      },
      warning: 'All actions performed during this session are logged and monitored',
    };
  }

  @Delete('impersonate/:sessionId')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_IMPERSONATE)
  @ApiOperation({
    summary: 'End impersonation session',
    description: `End an active impersonation session.

**Required Permission:** \`platform:support:impersonate\`
**Note:** You can only end your own impersonation sessions`,
  })
  @ApiParam({ name: 'sessionId', description: 'Impersonation session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Session ended',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        sessionId: { type: 'string' },
        duration: { type: 'number', description: 'Duration in milliseconds' },
        actionsPerformed: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 409, description: 'Session already ended' })
  async endImpersonation(
    @Param('sessionId') sessionId: string,
    @Body() dto: EndImpersonationDto,
    @Req() req: PlatformSupportRequest,
  ) {
    const session = await this.impersonationService.endImpersonation(sessionId, req.user.userId, req.ip, dto.reason);

    return {
      message: 'Impersonation session ended',
      sessionId: session.id,
      duration: session.endedAt ? session.endedAt.getTime() - session.startedAt.getTime() : 0,
      actionsPerformed: session.actionsPerformed.length,
    };
  }

  @Get('impersonate/active')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_IMPERSONATE)
  @ApiOperation({
    summary: 'List active impersonation sessions',
    description: `Get all active impersonation sessions for the current platform user.

**Required Permission:** \`platform:support:impersonate\``,
  })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async getActiveSessions(@Req() req: PlatformSupportRequest) {
    return this.impersonationService.getActiveSessions(req.user.userId);
  }

  @Get('impersonate/history')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_IMPERSONATE)
  @ApiOperation({
    summary: 'Get impersonation history',
    description: `Get the impersonation history for the current platform user.

**Required Permission:** \`platform:support:impersonate\``,
  })
  @ApiResponse({ status: 200, description: 'Impersonation history (last 50 sessions)' })
  async getImpersonationHistory(@Req() req: PlatformSupportRequest) {
    return this.impersonationService.getHistory(req.user.userId);
  }
}
