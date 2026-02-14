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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { ApiErrorResponses, Cacheable, Roles } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  AddPackageItemsDto,
  ClonePackageDto,
  CreateServicePackageDto,
  PackageFilterDto,
  ServicePackageCursorResponseDto,
  ServicePackagePaginatedResponseDto,
  ServicePackageSummaryResponseDto,
  UpdateServicePackageDto,
} from '../dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('Service Packages')
@ApiBearerAuth('tenant-auth')
@ApiErrorResponses(
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
)
@Controller('packages')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(GlobalCacheInterceptor)
@ApiExtraModels(ServicePackageSummaryResponseDto, ServicePackagePaginatedResponseDto, ServicePackageCursorResponseDto)
export class PackagesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new service package' })
  @ApiCreatedResponse({ description: 'Package created successfully', type: ServicePackageSummaryResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  create(@Body() dto: CreateServicePackageDto) {
    return this.catalogService.createPackage(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all service packages with filtering (Offset Pagination - Deprecated)',
    description: 'Supports filtering by active status and search. Use /packages/cursor for better performance.',
    deprecated: true,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiOkResponse({
    description: 'Return filtered packages with pagination meta',
    schema: { $ref: getSchemaPath(ServicePackagePaginatedResponseDto) },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllWithFilters(@Query() query: PackageFilterDto) {
    return this.catalogService.findAllPackagesWithFilters(query);
  }

  @Get('cursor')
  @ApiOperation({
    summary: 'Get all service packages with filtering (Cursor Pagination - Recommended)',
    description: 'Supports filtering by active status and search with cursor pagination',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiOkResponse({
    description: 'Return filtered packages with cursor pagination',
    schema: { $ref: getSchemaPath(ServicePackageCursorResponseDto) },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllWithFiltersCursor(@Query() query: PackageFilterDto) {
    return this.catalogService.findAllPackagesWithFiltersCursor(query);
  }

  @Get('cursor/no-filters')
  @ApiOperation({ summary: 'Get all packages with cursor pagination (no filters)' })
  @ApiOkResponse({
    description: 'Return paginated packages',
    schema: { $ref: getSchemaPath(ServicePackageCursorResponseDto) },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.catalogService.findAllPackagesCursor(query);
  }

  @Get(':id')
  @Cacheable()
  @ApiOperation({ summary: 'Get service package by ID' })
  @ApiOkResponse({ description: 'Package details', type: ServicePackageSummaryResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findPackageById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update service package' })
  @ApiOkResponse({ description: 'Package updated', type: ServicePackageSummaryResponseDto })
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
