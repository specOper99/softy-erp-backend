import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { PlatformTimeEntryQueryDto, PlatformTimeEntryUpdateDto } from '../dto/platform-time-entries.dto';
import { PlatformTimeEntriesService } from '../services/platform-time-entries.service';

interface PlatformRequest {
  ip: string;
  headers: { 'user-agent'?: string };
  user: { userId: string };
}

@ApiTags('Platform - Time Entries')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/time-entries')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformTimeEntriesController {
  constructor(private readonly service: PlatformTimeEntriesService) {}

  @Get('tenant/:tenantId')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  @ApiOperation({ summary: 'List time entries for a tenant' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Query() query: PlatformTimeEntryQueryDto) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  @ApiOperation({ summary: 'Get time entry by id for a tenant' })
  @ApiQuery({ name: 'tenantId', description: 'Tenant UUID', required: true })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('tenantId') tenantId: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  @ApiOperation({ summary: 'Update time entry for a tenant' })
  @ApiQuery({ name: 'tenantId', description: 'Tenant UUID', required: true })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
    @Body() dto: PlatformTimeEntryUpdateDto,
    @Req() req: PlatformRequest,
  ) {
    return this.service.update(tenantId, id, dto, req.user.userId, req.ip, req.headers['user-agent']);
  }
}
