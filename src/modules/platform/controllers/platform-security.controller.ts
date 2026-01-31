import { TargetTenant } from '../../../common/decorators/target-tenant.decorator';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { RequireReason } from '../decorators/require-reason.decorator';
import {
  ForcePasswordResetDto,
  InitiateDataDeletionDto,
  InitiateDataExportDto,
  RevokeSessionsDto,
  UpdateIpAllowlistDto,
} from '../dto/security.dto';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { RequireReasonGuard } from '../guards/require-reason.guard';
import { PlatformSecurityService } from '../services/platform-security.service';

interface PlatformSecurityRequest {
  ip?: string;
  connection?: { remoteAddress?: string };
  user: {
    userId: string;
  };
}

/**
 * Controller for platform security and compliance operations
 */
@ApiTags('Platform - Security')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/security')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard, RequireReasonGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformSecurityController {
  constructor(private readonly securityService: PlatformSecurityService) {}

  @Post('tenants/:tenantId/users/:userId/force-password-reset')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.SECURITY_FORCE_PASSWORD_RESET)
  @RequireReason()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Force password reset for a user',
    description: `Force a specific user within a tenant to reset their password on next login.

**Required Permission:** \`platform:security:force-password-reset\`
**Allowed Roles:** SUPER_ADMIN, SECURITY_ADMIN

**⚠️ Security Operation:** Requires reason for audit trail`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiParam({ name: 'userId', description: 'User UUID within the tenant', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Password reset initiated' })
  @ApiResponse({ status: 404, description: 'User or tenant not found' })
  async forcePasswordReset(
    @TargetTenant() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ForcePasswordResetDto,
    @Request() req: PlatformSecurityRequest,
  ) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    await this.securityService.forcePasswordReset(
      { tenantId, userId, reason: dto.reason, notifyUser: dto.notifyUser },
      req.user.userId,
      ipAddress,
    );
  }

  @Post('tenants/:tenantId/revoke-sessions')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.SECURITY_REVOKE_SESSIONS)
  @RequireReason()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all sessions for a tenant',
    description: `Immediately invalidate all active sessions for users within a tenant. Users will be forced to re-authenticate.

**Required Permission:** \`platform:security:revoke-sessions\`
**Allowed Roles:** SUPER_ADMIN, SECURITY_ADMIN

**⚠️ Impact:** All users in the tenant will be logged out immediately`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Sessions revoked',
    schema: {
      type: 'object',
      properties: {
        revokedSessions: { type: 'number', description: 'Count of revoked sessions' },
      },
    },
  })
  async revokeSessions(
    @TargetTenant() tenantId: string,
    @Body() dto: RevokeSessionsDto,
    @Request() req: PlatformSecurityRequest,
  ) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    const count = await this.securityService.revokeAllSessions(
      { tenantId, reason: dto.reason },
      req.user.userId,
      ipAddress,
    );
    return { revokedSessions: count };
  }

  @Post('tenants/:tenantId/ip-allowlist')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.SECURITY_UPDATE_IP_ALLOWLIST)
  @RequireReason()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Update IP allowlist for a tenant',
    description: `Configure allowed IP addresses/ranges for a tenant. Only requests from these IPs will be permitted.

**Required Permission:** \`platform:security:update-ip-allowlist\`
**Allowed Roles:** SUPER_ADMIN, SECURITY_ADMIN

**⚠️ Caution:** Incorrect configuration may lock out users`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'IP allowlist updated' })
  async updateIpAllowlist(
    @TargetTenant() tenantId: string,
    @Body() dto: UpdateIpAllowlistDto,
    @Request() req: PlatformSecurityRequest,
  ) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    await this.securityService.updateIpAllowlist(
      { tenantId, allowedIps: dto.ipAddresses, reason: dto.reason },
      req.user.userId,
      ipAddress,
    );
  }

  @Post('tenants/:tenantId/data-export')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.DATA_EXPORT)
  @RequireReason()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Initiate GDPR data export',
    description: `Start an asynchronous data export job for GDPR compliance. Returns a job ID to track progress.

**Required Permission:** \`platform:data:export\`
**Allowed Roles:** SUPER_ADMIN, COMPLIANCE_ADMIN

**Note:** Large exports may take several hours to complete`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 202,
    description: 'Export job started',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'PENDING' },
        estimatedCompletion: { type: 'string', format: 'date-time' },
      },
    },
  })
  async initiateDataExport(
    @TargetTenant() tenantId: string,
    @Body() dto: InitiateDataExportDto,
    @Request() req: PlatformSecurityRequest,
  ) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    return this.securityService.initiateDataExport(
      { tenantId, exportType: 'gdpr', reason: dto.reason },
      req.user.userId,
      ipAddress,
    );
  }

  @Post('tenants/:tenantId/data-deletion')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.DATA_DELETE)
  @RequireReason()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Initiate GDPR data deletion',
    description: `Schedule tenant data for permanent deletion (GDPR Right to Erasure). Deletion is scheduled for 30 days to allow for cancellation.

**Required Permission:** \`platform:data:delete\`
**Allowed Roles:** SUPER_ADMIN

**⚠️ DESTRUCTIVE OPERATION:** This action cannot be undone after the 30-day grace period`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 202,
    description: 'Deletion scheduled',
    schema: {
      type: 'object',
      properties: {
        scheduledDate: { type: 'string', format: 'date-time' },
        cancellationDeadline: { type: 'string', format: 'date-time' },
      },
    },
  })
  async initiateDataDeletion(
    @TargetTenant() tenantId: string,
    @Body() dto: InitiateDataDeletionDto,
    @Request() req: PlatformSecurityRequest,
  ) {
    const ipAddress: string = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    return this.securityService.initiateDataDeletion(
      { tenantId, scheduleDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), reason: dto.reason },
      req.user.userId,
      ipAddress,
    );
  }

  @Get('tenants/:tenantId/risk-score')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.SECURITY_VIEW_RISK_SCORES)
  @ApiOperation({
    summary: 'Get tenant security risk score',
    description: `Retrieve the calculated security risk score for a tenant based on various factors.

**Required Permission:** \`platform:security:view-risk-scores\`
**Allowed Roles:** SUPER_ADMIN, SECURITY_ADMIN, SUPPORT_ADMIN

Risk factors include: login patterns, failed attempts, IP anomalies, configuration weaknesses`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Risk score retrieved',
    schema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        riskScore: {
          type: 'object',
          properties: {
            overall: { type: 'number', minimum: 0, maximum: 100 },
            factors: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  })
  async getTenantRiskScore(@TargetTenant() tenantId: string) {
    const riskScore = await this.securityService.getTenantRiskScore(tenantId);
    return {
      tenantId,
      riskScore: {
        overall: riskScore,
        factors: [],
      },
    };
  }
}
