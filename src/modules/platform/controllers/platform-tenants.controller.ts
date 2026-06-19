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
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { RequireReasonGuard } from '../guards/require-reason.guard';
import { PlatformTenantService } from '../services/platform-tenant.service';

interface PlatformTenantRequest {
  ip: string;
  validatedReason?: string;
  user: {
    id: string;
    role?: string;
  };
}

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
  @ApiOperation({ summary: 'List all tenants' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, slug, or email' })
  @ApiQuery({ name: 'status', required: false, enum: TenantStatus })
  @ApiQuery({ name: 'plan', required: false, enum: ['FREE', 'PRO', 'ENTERPRISE'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 100' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of tenants with pagination' })
  async listTenants(@Query() query: ListTenantsDto) {
    return this.tenantService.listTenants(query);
  }

  @Get(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({ summary: 'Get tenant details' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'tenants.not_found' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenant(id);
  }

  @Post()
  @RequirePlatformPermissions(PlatformPermission.TENANTS_CREATE)
  @ApiOperation({ summary: 'Create new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async createTenant(@Body() dto: CreateTenantDto, @Req() req: PlatformTenantRequest) {
    return this.tenantService.createTenant(dto, req.user.id, req.ip);
  }

  @Patch(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_UPDATE)
  @RequireReason()
  @UseGuards(RequireReasonGuard)
  @ApiOperation({ summary: 'Update tenant' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 400, description: 'Reason required' })
  async updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.updateTenant(id, dto, req.user.id, req.ip, req.validatedReason ?? '');
  }

  @Post(':id/suspend')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_SUSPEND)
  @ApiOperation({ summary: 'Suspend tenant' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant suspended' })
  @ApiResponse({ status: 409, description: 'Already suspended' })
  async suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.suspendTenant(id, dto, req.user.id, req.ip);
  }

  @Post(':id/reactivate')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_SUSPEND)
  @ApiOperation({ summary: 'Reactivate tenant' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant reactivated' })
  @ApiResponse({ status: 409, description: 'Already active' })
  async reactivateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.reactivateTenant(id, dto, req.user.id, req.ip);
  }

  @Post(':id/lock')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_LOCK)
  @RequireReason()
  @UseGuards(RequireReasonGuard)
  @ApiOperation({ summary: 'Lock tenant (security)' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant locked' })
  async lockTenant(@Param('id', ParseUUIDPipe) id: string, @Req() req: PlatformTenantRequest) {
    return this.tenantService.lockTenant(id, req.validatedReason ?? '', req.user.id, req.ip);
  }

  @Delete(':id')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_DELETE)
  @RequireReason()
  @UseGuards(RequireReasonGuard)
  @ApiOperation({ summary: 'Schedule tenant deletion' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiQuery({ name: 'reason', required: false, description: 'Deletion reason when body cannot be sent' })
  @ApiResponse({ status: 200, description: 'Deletion scheduled' })
  async deleteTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteTenantDto,
    @Req() req: PlatformTenantRequest,
  ) {
    return this.tenantService.deleteTenant(id, dto, req.user.id, req.ip, req.validatedReason ?? '');
  }

  @Get(':id/metrics')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({ summary: 'Get tenant metrics' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant metrics' })
  async getTenantMetrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenantMetrics(id);
  }

  @Get(':id/timeline')
  @RequirePlatformPermissions(PlatformPermission.TENANTS_READ)
  @ApiOperation({ summary: 'Get tenant lifecycle timeline' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Lifecycle events' })
  async getTenantTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.getTenantTimeline(id);
  }
}
