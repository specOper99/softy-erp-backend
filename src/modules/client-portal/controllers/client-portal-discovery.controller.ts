import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { CatalogService } from '../../catalog/services/catalog.service';
import { ReviewResponseDto } from '../../reviews/dto/review-response.dto';
import { ReviewsService } from '../../reviews/services/reviews.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import {
  ClientPortalAvailabilityResponseDto,
  ClientPortalListingDetailsResponseDto,
  ClientPortalListingsResponseDto,
  ClientPortalListingSummaryDto,
} from '../dto/client-portal-openapi.dto';
import { ClientPortalListingsQueryDto, ClientPortalAvailabilityQueryDto } from '../dto/client-portal-openapi.dto';
import { GetTenant } from '../decorators/validate-tenant-slug.decorator';
import { AvailabilityService } from '../services/availability.service';
import { ClientPortalService } from '../services/client-portal.service';

@ApiTags('Client Portal')
@Controller('client-portal')
@SkipTenant()
export class ClientPortalDiscoveryController {
  constructor(
    private readonly clientPortalService: ClientPortalService,
    private readonly catalogService: CatalogService,
    private readonly reviewsService: ReviewsService,
    private readonly availabilityService: AvailabilityService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('listings')
  @ApiOperation({ summary: 'Get client portal listings' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'tenantSlug', required: true })
  @ApiOkResponse({ type: ClientPortalListingsResponseDto })
  async getListings(@Query() query: ClientPortalListingsQueryDto): Promise<ClientPortalListingsResponseDto> {
    const tenant = await this.resolveTenant(query.tenantSlug);
    return this.clientPortalService.getListingsForTenant(tenant, query);
  }

  @Get('listings/featured')
  @ApiOperation({ summary: 'Get featured listings' })
  @ApiQuery({ name: 'tenantSlug', required: true })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(ClientPortalListingSummaryDto) },
    },
  })
  async getFeaturedListings(@Query('tenantSlug') tenantSlug?: string): Promise<ClientPortalListingSummaryDto[]> {
    const tenant = await this.resolveTenant(tenantSlug);
    return this.clientPortalService.getFeaturedListingsForTenant(tenant);
  }

  @Get('listings/:id')
  @ApiOperation({ summary: 'Get listing details' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiQuery({ name: 'tenantSlug', required: true })
  @ApiOkResponse({ type: ClientPortalListingDetailsResponseDto })
  async getListingDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantSlug') tenantSlug?: string,
  ): Promise<ClientPortalListingDetailsResponseDto> {
    const tenant = await this.resolveTenant(tenantSlug);
    const servicePackage = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findPackageById(id),
    );
    if (!servicePackage || servicePackage.tenantId !== tenant.id || !servicePackage.isActive) {
      throw new NotFoundException('booking.listing_not_found');
    }

    const [reviews, reviewCount] = await TenantContextService.run(tenant.id, async () =>
      this.reviewsService.findApprovedByPackage(id, new PaginationDto()),
    );
    const rating =
      reviewCount > 0 ? reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0) / reviewCount : 0;

    return {
      ...this.mapListingSummary(servicePackage, tenant, rating, reviewCount),
      description: servicePackage.description ?? '',
      gallery: [],
      highlights: [],
      duration: undefined,
      includes: [],
    };
  }

  @Get('listings/:id/availability')
  @ApiOperation({ summary: 'Get listing availability by date range' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiOkResponse({ type: ClientPortalAvailabilityResponseDto })
  async getListingAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ClientPortalAvailabilityQueryDto,
  ): Promise<ClientPortalAvailabilityResponseDto> {
    const tenant = await this.resolveTenant(query.tenantSlug);
    const fromDate = query.from ?? new Date().toISOString().split('T')[0] ?? '';
    const toDate = query.to ?? fromDate;
    const dates = this.buildDateRange(fromDate, toDate);

    const days = await Promise.all(
      dates.map(async (date) => {
        const availability = await this.availabilityService.checkAvailability(tenant.id, id, date);
        return {
          date,
          slots: availability.timeSlots.map((slot, index) => ({
            id: `${date}-slot-${index + 1}`,
            time: slot.start,
            available: slot.available,
            capacity: slot.capacity + slot.booked,
            remaining: slot.capacity,
          })),
        };
      }),
    );

    return {
      listingId: id,
      days,
    };
  }

  @Get(':slug/packages')
  @ApiOperation({ summary: 'Get all active service packages for tenant' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by name or description' })
  @ApiQuery({ name: 'priceMin', required: false })
  @ApiQuery({ name: 'priceMax', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPackages(
    @GetTenant() tenant: Tenant,
    @Query('q') search?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query() pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: ServicePackage[]; total: number; page: number; limit: number }> {
    return this.clientPortalService.getPackagesForTenant(
      tenant,
      search,
      priceMin,
      priceMax,
      pagination.page ?? 1,
      pagination.limit ?? 10,
    );
  }

  @Get(':slug/packages/:id')
  @ApiOperation({ summary: 'Get package details by ID' })
  async getPackage(@GetTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string): Promise<ServicePackage> {
    const servicePackage = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findPackageById(id),
    );
    if (!servicePackage || servicePackage.tenantId !== tenant.id || !servicePackage.isActive) {
      throw new NotFoundException('client_portal.package_not_found');
    }

    return servicePackage;
  }

  @Get(':slug/packages/:id/reviews')
  @ApiOperation({ summary: 'Get approved reviews for a package' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPackageReviews(
    @GetTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) packageId: string,
    @Query() pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: ReviewResponseDto[]; total: number; page: number; limit: number }> {
    const [reviews, total] = await TenantContextService.run(tenant.id, async () =>
      this.reviewsService.findApprovedByPackage(packageId, pagination),
    );
    const data = reviews.map((review) => plainToInstance(ReviewResponseDto, review, { excludeExtraneousValues: true }));

    return {
      data,
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 10,
    };
  }

  @Get(':slug/packages/:id/availability')
  @ApiOperation({ summary: 'Check availability for a package on a specific date' })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiQuery({
    name: 'findNext',
    required: false,
    description: 'Find next available date if requested date unavailable',
  })
  async checkAvailability(
    @GetTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) packageId: string,
    @Query('date') date: string,
    @Query('findNext') findNext?: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('client_portal.invalid_date_format_hint');
    }

    const availability = await this.availabilityService.checkAvailability(tenant.id, packageId, date);
    if (findNext === 'true' && !availability.available) {
      availability.nextAvailableDate = await this.availabilityService.findNextAvailableDate(tenant.id, packageId, date);
    }

    return availability;
  }

  private async resolveTenant(tenantSlug?: string): Promise<Tenant> {
    if (!tenantSlug) {
      throw new BadRequestException('client_portal.tenant_slug_required_param');
    }
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    this.tenantsService.ensurePortalTenantAccessible(tenant, {
      route: 'client-portal-listings',
      tenantSlug,
    });
    return tenant;
  }

  private mapListingSummary(
    servicePackage: ServicePackage,
    tenant: Tenant,
    rating: number,
    reviewCount = 0,
  ): ClientPortalListingSummaryDto {
    return {
      id: servicePackage.id,
      title: servicePackage.name,
      shortDescription: servicePackage.description ?? '',
      location: tenant.address ?? undefined,
      priceFrom: Number(servicePackage.price),
      currency: tenant.baseCurrency,
      rating,
      reviewCount,
      imageUrl: undefined,
      tags: [],
    };
  }

  private buildDateRange(from: string, to: string): string[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException('client_portal.date_format_yyyy_mm_dd');
    }

    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException('client_portal.availability_range_invalid');
    }

    const result: string[] = [];
    const current = new Date(start);
    while (current <= end && result.length < 31) {
      const value = current.toISOString().split('T')[0];
      if (value) {
        result.push(value);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return result;
  }
}
