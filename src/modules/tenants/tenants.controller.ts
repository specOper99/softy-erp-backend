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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { MfaRequired } from '../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../users/enums/role.enum';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
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
  @MfaRequired()
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
