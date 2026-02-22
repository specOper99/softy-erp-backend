import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { MfaRequired } from '../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../users/enums/role.enum';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { StudioSettingsResponseDto, UpdateStudioSettingsDto } from './dto/studio-settings.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@ApiErrorResponses(
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
)
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create tenant (disabled for studio API)',
    description: 'Tenant creation is platform-managed and not available for studio-side tenant admin users.',
  })
  @ApiResponse({ status: 403, description: 'Tenant creation is not supported via API' })
  create(@Body() _createTenantDto: CreateTenantDto) {
    throw new ForbiddenException('Tenant creation is not supported via API');
  }

  @Get()
  @ApiOperation({
    summary: 'Get current tenant',
    description: 'Returns only the current tenant (studio) resolved from authenticated tenant context.',
  })
  @ApiResponse({ status: 200, description: 'Current tenant returned', type: Tenant, isArray: true })
  async findAll() {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return [await this.tenantsService.findOne(tenantId)];
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tenant by ID (current tenant only)',
    description: 'Cross-tenant access is forbidden. You can only access your own tenant ID.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant returned', type: Tenant })
  @ApiResponse({ status: 403, description: 'Cross-tenant access is forbidden' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    if (id !== tenantId) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @MfaRequired()
  @ApiOperation({
    summary: 'Update tenant (current tenant only)',
    description: 'Studio tenant admin can update only the current tenant settings. Cross-tenant updates are forbidden.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: Tenant })
  @ApiResponse({ status: 403, description: 'Cross-tenant access is forbidden' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateTenantDto: UpdateTenantDto) {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    if (id !== tenantId) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete tenant (disabled for studio API)',
    description: 'Tenant deletion is platform-managed and not available for studio-side tenant admin users.',
  })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 403, description: 'Tenant deletion is not supported via API' })
  remove(@Param('id', ParseUUIDPipe) _id: string) {
    throw new ForbiddenException('Tenant deletion is not supported via API');
  }

  // Studio Settings Endpoints
  @Get('studio/settings')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get studio settings' })
  @ApiResponse({ status: 200, description: 'Studio settings retrieved', type: StudioSettingsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getStudioSettings(): Promise<StudioSettingsResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.tenantsService.getStudioSettings(tenantId);
  }

  @Put('studio/settings')
  @MfaRequired()
  @ApiOperation({ summary: 'Update studio settings' })
  @ApiResponse({ status: 200, description: 'Studio settings updated', type: StudioSettingsResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateStudioSettings(@Body() dto: UpdateStudioSettingsDto): Promise<StudioSettingsResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.tenantsService.updateStudioSettings(tenantId, dto);
  }
}
