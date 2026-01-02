import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { Cacheable, Roles } from '../../../common/decorators';
import { Role } from '../../../common/enums';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  AddPackageItemsDto,
  CreateServicePackageDto,
  UpdateServicePackageDto,
} from '../dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('Service Packages')
@ApiBearerAuth()
@Controller('packages')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(GlobalCacheInterceptor)
export class PackagesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new service package' })
  create(@Body() dto: CreateServicePackageDto) {
    return this.catalogService.createPackage(dto);
  }

  @Get()
  @Cacheable()
  @ApiOperation({ summary: 'Get all service packages' })
  findAll() {
    return this.catalogService.findAllPackages();
  }

  @Get(':id')
  @Cacheable()
  @ApiOperation({ summary: 'Get service package by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findPackageById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update service package' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServicePackageDto,
  ) {
    return this.catalogService.updatePackage(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete service package (Admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.deletePackage(id);
  }

  @Post(':id/items')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Add items to service package' })
  addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPackageItemsDto,
  ) {
    return this.catalogService.addPackageItems(id, dto);
  }

  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Remove item from package' })
  removeItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.catalogService.removePackageItem(itemId);
  }
}
