import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { RequireReason } from '../decorators/require-reason.decorator';
import {
  CreateTenantDto,
  DeleteTenantDto,
  ListTenantsDto,
  ReactivateTenantDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from '../dto/tenant-management.dto';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { RequireReasonGuard } from '../guards/require-reason.guard';
import { PlatformTenantService } from '../services/platform-tenant.service';

interface PlatformTenantRequest {
  ip: string;
  validatedReason?: string;
  user: {
    userId: string;
  };
}

/**
 * Platform controller for tenant management
 * All routes require platform context and appropriate permissions
 */
@ApiTags('Platform - Tenants')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/tenants')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformTenantsController {
  constructor(private readonly tenantService: PlatformTenantService) {}

  @Get()
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({
    summary: 'List all tenants',
    description: `Retrieve a paginated list of all tenants with optional filters.

**Required Permission:** \`platform:tenants:read\`
**Allowed Roles:** SUPER_ADMIN, SUPPORT_ADMIN, BILLING_ADMIN, COMPLIANCE_ADMIN, SECURITY_ADMIN, ANALYTICS_VIEWER`,
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, slug, or email' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'SUSPENDED', 'GRACE_PERIOD', 'LOCKED'] })
  @ApiQuery({ name: 'plan', required: false, enum: ['FREE', 'PRO', 'ENTERPRISE'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 100' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of tenants with pagination' })
  async listTenants(@Query() query: ListTenantsDto) {
    return this.tenantService.listTenants(query);
  }

  @Get(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({
    summary: 'Get tenant details',
    description: `Retrieve detailed information about a specific tenant including metrics and subscription info.

**Required Permission:** \`platform:tenants:read\``,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenant(id);
  }

  @Post()
  @RequirePlatformPermissions(PlatformPermission.TENANTS_CREATE)
  @ApiOperation({
    summary: 'Create new tenant',
    description: `Onboard a new tenant to the platform.

**Required Permission:** \`platform:tenants:create\`
**Allowed Roles:** SUPER_ADMIN only`,
  })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async createTenant(@Body() dto: CreateTenantDto, @Req() req: PlatformTenantRequest) {
    return this.tenantService.createTenant(dto, req.user.userId, req.ip);
  }

  @Patch(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_UPDATE)
  @RequireReason()
  @UseGuards(RequireReasonGuard)
  @ApiOperation({
    summary: 'Update tenant',
    description: `Update tenant settings. Requires a reason for audit trail.

**Required Permission:** \`platform:tenants:update\`
**Allowed Roles:** SUPER_ADMIN
**⚠️ Requires reason field (min 10 characters)**`,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 400, description: 'Reason required' })
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.updateTenant(id, dto, req.user.userId, req.ip, req.validatedReason ?? '');
  }

  @Post(':id/suspend')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_SUSPEND)
  @ApiOperation({
    summary: 'Suspend tenant',
    description: `Suspend a tenant account (e.g., for non-payment). Can specify a grace period.

**Required Permission:** \`platform:tenants:suspend\`
**Allowed Roles:** SUPER_ADMIN, SUPPORT_ADMIN`,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant suspended' })
  @ApiResponse({ status: 409, description: 'Already suspended' })
  async suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.suspendTenant(id, dto, req.user.userId, req.ip);
  }

  @Post(':id/reactivate')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_SUSPEND)
  @ApiOperation({
    summary: 'Reactivate tenant',
    description: `Reactivate a suspended tenant account.

**Required Permission:** \`platform:tenants:suspend\`
**Allowed Roles:** SUPER_ADMIN, SUPPORT_ADMIN`,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant reactivated' })
  @ApiResponse({ status: 409, description: 'Already active' })
  async reactivateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.reactivateTenant(id, dto, req.user.userId, req.ip);
  }

  @Post(':id/lock')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_LOCK)
  @RequireReason()
  @UseGuards(RequireReasonGuard)
  @ApiOperation({
    summary: 'Lock tenant (security)',
    description: `Emergency lock for security incidents. Prevents all access.

**Required Permission:** \`platform:tenants:lock\`
**Allowed Roles:** SUPER_ADMIN, SECURITY_ADMIN
**⚠️ Requires reason field (min 10 characters)**`,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant locked' })
  async lockTenant(@Param('id', ParseUUIDPipe) id: string, @Req() req: PlatformTenantRequest) {
    return this.tenantService.lockTenant(id, req.validatedReason ?? '', req.user.userId, req.ip);
  }

  @Delete(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_DELETE)
  @ApiOperation({
    summary: 'Schedule tenant deletion',
    description: `Schedule tenant for deletion with a grace period (default 30 days).

**Required Permission:** \`platform:tenants:delete\`
**Allowed Roles:** SUPER_ADMIN only
**⚠️ Destructive operation - all data will be permanently deleted**`,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Deletion scheduled' })
  async deleteTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.deleteTenant(id, dto, req.user.userId, req.ip);
  }

  @Get(':id/metrics')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({
    summary: 'Get tenant metrics',
    description: `Retrieve usage metrics for a tenant (users, bookings, revenue, etc.).

**Required Permission:** \`platform:tenants:read\``,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant metrics' })
  async getTenantMetrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenantMetrics(id);
  }

  @Get(':id/timeline')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({
    summary: 'Get tenant lifecycle timeline',
    description: `Retrieve the complete lifecycle history of a tenant (created, suspended, reactivated, etc.).

**Required Permission:** \`platform:tenants:read\``,
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Lifecycle events' })
  async getTenantTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenantTimeline(id);
  }
}
