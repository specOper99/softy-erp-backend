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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { Cacheable, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { AddPackageItemsDto, ClonePackageDto, CreateServicePackageDto, UpdateServicePackageDto } from '../dto';
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
  @ApiResponse({ status: 201, description: 'Package created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  create(@Body() dto: CreateServicePackageDto) {
    return this.catalogService.createPackage(dto);
  }

  @Get()
  @Cacheable()
  @ApiOperation({
    summary: 'Get all service packages',
    deprecated: true,
    description: 'Use /packages/cursor for better performance with large datasets.',
  })
  @ApiResponse({ status: 200, description: 'Return all packages' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.catalogService.findAllPackages();
  }

  @Get('cursor')
  @ApiOperation({ summary: 'Get all packages with cursor pagination' })
  @ApiResponse({ status: 200, description: 'Return paginated packages' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.catalogService.findAllPackagesCursor(query);
  }

  @Get(':id')
  @Cacheable()
  @ApiOperation({ summary: 'Get service package by ID' })
  @ApiResponse({ status: 200, description: 'Package details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findPackageById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update service package' })
  @ApiResponse({ status: 200, description: 'Package updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServicePackageDto) {
    return this.catalogService.updatePackage(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete service package (Admin only)' })
  @ApiResponse({ status: 200, description: 'Package deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.deletePackage(id);
  }

  @Post(':id/items')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Add items to service package' })
  @ApiResponse({ status: 201, description: 'Items added' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Package or Item not found' })
  addItems(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPackageItemsDto) {
    return this.catalogService.addPackageItems(id, dto);
  }

  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Remove item from package' })
  @ApiResponse({ status: 200, description: 'Item removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  removeItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.catalogService.removePackageItem(itemId);
  }

  @Post(':id/clone')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Clone a service package (template or regular)' })
  @ApiResponse({ status: 201, description: 'Package cloned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Source package not found' })
  clonePackage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClonePackageDto) {
    return this.catalogService.clonePackage(id, dto);
  }
}
