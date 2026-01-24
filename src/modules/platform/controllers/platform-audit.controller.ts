import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { PlatformAction } from '../enums/platform-action.enum';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { PlatformAuditService } from '../services/platform-audit.service';

/**
 * Platform controller for audit logs
 */
@ApiTags('Platform - Audit')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/audit')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformAuditController {
  constructor(private readonly auditService: PlatformAuditService) {}

  @Get('logs')
  @RequirePlatformPermissions(PlatformPermission.AUDIT_LOGS_READ)
  @ApiOperation({
    summary: 'Query platform audit logs',
    description: `Search and filter platform-level audit logs for compliance and investigation purposes.

**Required Permission:** \`platform:audit:read\`
**Allowed Roles:** SUPER_ADMIN, COMPLIANCE_ADMIN, SECURITY_ADMIN

Logs include: tenant operations, impersonation sessions, security events, configuration changes`,
  })
  @ApiQuery({
    name: 'platformUserId',
    required: false,
    description: 'Filter by platform user who performed the action',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filter by action type (e.g., TENANT_CREATED, IMPERSONATION_STARTED)',
  })
  @ApiQuery({ name: 'targetTenantId', required: false, description: 'Filter by affected tenant UUID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start of date range (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End of date range (ISO 8601)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum results to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit logs',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              action: { type: 'string' },
              platformUserId: { type: 'string', format: 'uuid' },
              targetTenantId: { type: 'string', format: 'uuid' },
              ipAddress: { type: 'string' },
              details: { type: 'object' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  async getAuditLogs(
    @Query('platformUserId') platformUserId?: string,
    @Query('action') action?: string,
    @Query('targetTenantId') targetTenantId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const MAX_LIMIT = 100;

    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    const effectiveLimit =
      parsedLimit !== undefined && Number.isFinite(parsedLimit)
        ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsedLimit)))
        : undefined;

    const parsedOffset = offset !== undefined ? Number(offset) : undefined;
    const effectiveOffset =
      parsedOffset !== undefined && Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : undefined;

    return this.auditService.findAll({
      platformUserId,
      action: action as PlatformAction | undefined,
      targetTenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: effectiveLimit,
      offset: effectiveOffset,
    });
  }
}
