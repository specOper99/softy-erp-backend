import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTenantDto, UpdateTenantDto } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() _createTenantDto: CreateTenantDto) {
    throw new ForbiddenException('Tenant creation is not supported via API');
  }

  @Get()
  async findAll() {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }
    return [await this.tenantsService.findOne(tenantId)];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId || id !== tenantId) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId || id !== tenantId) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  remove(@Param('id') _id: string) {
    throw new ForbiddenException('Tenant deletion is not supported via API');
  }
}
