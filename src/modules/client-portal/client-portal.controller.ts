import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { UpdateClientDto } from '../bookings/dto/client.dto';
import { Booking } from '../bookings/entities/booking.entity';
import { Client } from '../bookings/entities/client.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { ClientsService } from '../bookings/services/clients.service';
import { PackageFilterDto } from '../catalog/dto/package-filter.dto';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { CatalogService } from '../catalog/services/catalog.service';
import { NotificationType } from '../notifications/enums/notification.enum';
import { NotificationService } from '../notifications/services/notification.service';
import { CreateReviewDto } from '../reviews/dto/create-review.dto';
import { ReviewResponseDto } from '../reviews/dto/review-response.dto';
import { ReviewsService } from '../reviews/services/reviews.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantsService } from '../tenants/tenants.service';
import { GetTenant } from './decorators/validate-tenant-slug.decorator';
import { ClientTokenResponseDto, RequestMagicLinkDto, VerifyMagicLinkDto } from './dto/client-auth.dto';
import {
  ClientPortalAuthResponseDto,
  ClientPortalAvailabilityQueryDto,
  ClientPortalAvailabilityResponseDto,
  ClientPortalBookingDetailsResponseDto,
  ClientPortalBookingsListResponseDto,
  ClientPortalCancelBookingRequestDto,
  ClientPortalCancelBookingResponseDto,
  ClientPortalClientDto,
  ClientPortalCreateBookingRequestDto,
  ClientPortalCreateBookingResponseDto,
  ClientPortalListingDetailsResponseDto,
  ClientPortalListingsQueryDto,
  ClientPortalListingsResponseDto,
  ClientPortalListingSummaryDto,
  ClientPortalMessageResponseDto,
  ClientPortalNotificationPreferencesDto,
  ClientPortalProfileResponseDto,
} from './dto/client-portal-openapi.dto';
import { CreateClientBookingDto } from './dto/create-client-booking.dto';
import { UpdateClientProfileDto } from './dto/update-profile.dto';
import { ClientTokenGuard } from './guards/client-token.guard';
import { AvailabilityService } from './services/availability.service';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

@ApiTags('Client Portal')
@ApiExtraModels(
  ClientPortalAuthResponseDto,
  ClientPortalClientDto,
  ClientPortalProfileResponseDto,
  ClientPortalListingsResponseDto,
  ClientPortalListingSummaryDto,
  ClientPortalListingDetailsResponseDto,
  ClientPortalAvailabilityResponseDto,
  ClientPortalBookingsListResponseDto,
  ClientPortalBookingDetailsResponseDto,
  ClientPortalCreateBookingResponseDto,
  ClientPortalCancelBookingResponseDto,
  ClientPortalMessageResponseDto,
  ClientPortalNotificationPreferencesDto,
)
@ApiHeader({
  name: 'x-client-token',
  description: 'Magic link access token for the client',
  required: false,
})
@Controller('client-portal')
@SkipTenant()
export class ClientPortalController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientPortalService: ClientPortalService,
    private readonly catalogService: CatalogService,
    private readonly reviewsService: ReviewsService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationService: NotificationService,
    private readonly clientsService: ClientsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post(':slug/auth/request-magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a magic link login email' })
  @ApiBody({ type: RequestMagicLinkDto })
  @ApiOkResponse({ description: 'Magic link request processed', type: ClientPortalMessageResponseDto })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async requestMagicLink(@Param('slug') slug: string, @Body() dto: RequestMagicLinkDto): Promise<{ message: string }> {
    return this.clientAuthService.requestMagicLink(slug, dto.email);
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify magic link token and get access token' })
  @ApiBody({ type: VerifyMagicLinkDto })
  @ApiCreatedResponse({ description: 'Magic link verified', type: ClientPortalAuthResponseDto })
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto): Promise<ClientTokenResponseDto> {
    const result = await this.clientAuthService.verifyMagicLink(dto.token);
    return {
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000),
      client: {
        id: result.client.id,
        name: result.client.name,
        email: result.client.email,
        tenantSlug: dto.tenantSlug,
      },
    };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate token' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalMessageResponseDto })
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const token = req.headers['x-client-token'] as string;
    await this.clientAuthService.logout(token);
    return { message: 'Logged out successfully' };
  }

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
    const filter = new PackageFilterDto();
    filter.search = query.search;
    filter.isActive = true;
    filter.page = query.page ?? 1;
    filter.limit = query.pageSize ?? 6;

    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    let items = paginated.data.filter((pkg) => pkg.tenantId === tenant.id && pkg.isActive);

    if (query.minPrice !== undefined) {
      items = items.filter((pkg) => Number(pkg.price) >= Number(query.minPrice));
    }
    if (query.maxPrice !== undefined) {
      items = items.filter((pkg) => Number(pkg.price) <= Number(query.maxPrice));
    }

    const reviewAggregates = await this.reviewsService.getApprovedAggregatesByPackageIds(
      tenant.id,
      items.map((pkg) => pkg.id),
    );
    const reviewStatsByPackageId = new Map(reviewAggregates.map((aggregate) => [aggregate.packageId, aggregate]));

    const listingItems = items.map((pkg) => {
      const aggregate = reviewStatsByPackageId.get(pkg.id);
      return this.mapListingSummary(pkg, tenant, aggregate?.avgRating ?? 0, aggregate?.reviewCount ?? 0);
    });

    return {
      items: listingItems,
      total: paginated.meta.totalItems,
      page: paginated.meta.page,
      pageSize: paginated.meta.pageSize,
    };
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
    const filter = new PackageFilterDto();
    filter.isActive = true;
    filter.page = 1;
    filter.limit = 6;

    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    const items = paginated.data.filter((pkg) => pkg.tenantId === tenant.id && pkg.isActive).slice(0, 6);

    const reviewAggregates = await this.reviewsService.getApprovedAggregatesByPackageIds(
      tenant.id,
      items.map((pkg) => pkg.id),
    );
    const reviewStatsByPackageId = new Map(reviewAggregates.map((aggregate) => [aggregate.packageId, aggregate]));

    return items.map((pkg) => {
      const aggregate = reviewStatsByPackageId.get(pkg.id);
      return this.mapListingSummary(pkg, tenant, aggregate?.avgRating ?? 0, aggregate?.reviewCount ?? 0);
    });
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
      throw new NotFoundException('Listing not found');
    }

    const [reviews, reviewCount] = await this.reviewsService.findApprovedByPackage(tenant.id, id, new PaginationDto());
    const rating =
      reviewCount > 0 ? reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0) / reviewCount : 0;

    return {
      ...this.mapListingSummary(servicePackage, tenant, rating, reviewCount),
      description: servicePackage.description ?? '',
      gallery: [],
      highlights: (servicePackage.packageItems ?? []).map((item) => item.taskType?.name).filter(Boolean) as string[],
      duration: undefined,
      includes: (servicePackage.packageItems ?? []).map((item) => item.taskType?.name).filter(Boolean) as string[],
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
    const filter = new PackageFilterDto();
    filter.search = search;
    filter.isActive = true;
    filter.page = pagination.page ?? 1;
    filter.limit = pagination.limit ?? 10;

    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    let data = paginated.data.filter((pkg) => pkg.tenantId === tenant.id && pkg.isActive);

    if (priceMin !== undefined) {
      data = data.filter((pkg) => Number(pkg.price) >= Number(priceMin));
    }
    if (priceMax !== undefined) {
      data = data.filter((pkg) => Number(pkg.price) <= Number(priceMax));
    }

    return {
      data,
      total: paginated.meta.totalItems,
      page: paginated.meta.page,
      limit: paginated.meta.pageSize,
    };
  }

  @Get(':slug/packages/:id')
  @ApiOperation({ summary: 'Get package details by ID' })
  async getPackage(@GetTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string): Promise<ServicePackage> {
    const servicePackage = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findPackageById(id),
    );
    if (!servicePackage || servicePackage.tenantId !== tenant.id || !servicePackage.isActive) {
      throw new NotFoundException('Package not found');
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
    const [reviews, total] = await this.reviewsService.findApprovedByPackage(tenant.id, packageId, pagination);
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
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    const availability = await this.availabilityService.checkAvailability(tenant.id, packageId, date);
    if (findNext === 'true' && !availability.available) {
      availability.nextAvailableDate = await this.availabilityService.findNextAvailableDate(tenant.id, packageId, date);
    }

    return availability;
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for the authenticated client' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: ClientPortalBookingsListResponseDto })
  async getMyBookings(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<ClientPortalBookingsListResponseDto> {
    const client = this.getClientFromRequest(req);
    const currentPage = Number(page ?? 1);
    const currentPageSize = Number(pageSize ?? 10);
    const result = await this.clientPortalService.getMyBookingsPaginated(
      client.id,
      client.tenantId,
      currentPage,
      currentPageSize,
    );

    return {
      items: result.items.map((booking) => this.mapBookingListItem(booking)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get a specific booking' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalBookingDetailsResponseDto })
  async getBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<ClientPortalBookingDetailsResponseDto> {
    const client = this.getClientFromRequest(req);
    const booking = await this.clientPortalService.getBooking(id, client.id, client.tenantId);
    return this.mapBookingDetails(booking, client);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create a new client portal booking' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: ClientPortalCreateBookingRequestDto })
  @ApiResponse({ status: 201, type: ClientPortalCreateBookingResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createBooking(
    @Req() req: Request,
    @Body() dto: ClientPortalCreateBookingRequestDto,
  ): Promise<ClientPortalCreateBookingResponseDto> {
    const client = this.getClientFromRequest(req);
    const createDto: CreateClientBookingDto = {
      packageId: dto.listingId,
      eventDate: dto.date,
      startTime: dto.time,
      notes: this.serializeBookingPortalMeta(dto),
    };
    const booking = await this.clientPortalService.createBooking(client, createDto);

    return {
      id: booking.id,
      reference: this.buildBookingReference(booking.id, booking.createdAt),
      status: booking.status === BookingStatus.CONFIRMED ? 'confirmed' : 'pending',
      scheduledAt: new Date(`${dto.date}T${dto.time}:00.000Z`),
    };
  }

  @Patch('bookings/:id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: ClientPortalCancelBookingRequestDto, required: false })
  @ApiOkResponse({ type: ClientPortalCancelBookingResponseDto })
  async cancelBooking(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClientPortalCancelBookingRequestDto = {},
  ): Promise<ClientPortalCancelBookingResponseDto> {
    const client = this.getClientFromRequest(req);
    const booking = await this.clientPortalService.cancelMyBooking(id, client.id, client.tenantId, dto.reason);

    return {
      id: booking.id,
      status: 'cancelled',
      reference: this.buildBookingReference(booking.id, booking.createdAt),
      cancelledAt: booking.cancelledAt ?? new Date(),
    };
  }

  @Post('bookings/:id/review')
  @ApiOperation({ summary: 'Submit a review for a completed booking' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: CreateReviewDto })
  async submitReview(@Req() req: Request, @Param('id', ParseUUIDPipe) bookingId: string, @Body() dto: CreateReviewDto) {
    const client = this.getClientFromRequest(req);
    const booking = await this.clientPortalService.getBooking(bookingId, client.id, client.tenantId);

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Can only review completed bookings');
    }

    const duplicate = await this.reviewsService.checkDuplicateReview(client.tenantId, client.id, bookingId);
    if (duplicate) {
      throw new ConflictException('You have already reviewed this booking');
    }

    const review = await this.reviewsService.create(client.tenantId, client.id, bookingId, booking.packageId, dto);

    if (client.notificationPreferences?.inApp) {
      await this.notificationService.create({
        tenantId: client.tenantId,
        clientId: client.id,
        userId: null,
        type: NotificationType.SYSTEM_ALERT,
        title: 'Review Submitted',
        message: 'Your review has been submitted and is pending approval',
        metadata: { reviewId: review.id },
      });
    }

    return review;
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated client profile' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalProfileResponseDto })
  async getProfile(@Req() req: Request): Promise<ClientPortalProfileResponseDto> {
    const client = this.getClientFromRequest(req);
    const profile = await this.clientPortalService.getClientProfile(client.id, client.tenantId);
    const tenant = await this.tenantsService.findOne(client.tenantId);

    return {
      id: profile.id ?? client.id,
      email: profile.email ?? client.email,
      name: profile.name ?? client.name,
      phone: profile.phone ?? client.phone,
      tenantSlug: tenant.slug,
      company: tenant.name,
      location: tenant.address ?? undefined,
      joinedAt: client.createdAt,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update client profile' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: UpdateClientProfileDto })
  @ApiOkResponse({ type: ClientPortalProfileResponseDto })
  async updateProfile(
    @Req() req: Request,
    @Body() dto: UpdateClientProfileDto,
  ): Promise<ClientPortalProfileResponseDto> {
    const client = this.getClientFromRequest(req);
    const updateDto: UpdateClientDto = {};

    if (dto.name !== undefined) updateDto.name = dto.name;
    if (dto.phone !== undefined) updateDto.phone = dto.phone;

    if (dto.emailNotifications !== undefined || dto.inAppNotifications !== undefined) {
      const currentPrefs = client.notificationPreferences ?? { email: false, inApp: false };
      updateDto.notificationPreferences = {
        email: dto.emailNotifications ?? currentPrefs.email,
        inApp: dto.inAppNotifications ?? currentPrefs.inApp,
        marketing: currentPrefs.marketing ?? currentPrefs.email,
        reminders: currentPrefs.reminders ?? currentPrefs.inApp,
        updates: currentPrefs.updates ?? currentPrefs.inApp,
      };
    }

    const updated = await this.clientsService.update(client.id, updateDto);
    const tenant = await this.tenantsService.findOne(client.tenantId);

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      tenantSlug: tenant.slug,
      company: tenant.name,
      location: tenant.address ?? undefined,
      joinedAt: updated.createdAt,
    };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get client notifications' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getNotifications(@Req() req: Request, @Query() pagination: PaginationDto = new PaginationDto()) {
    const client = this.getClientFromRequest(req);
    const [notifications, total] = await this.notificationService.findByClient(client.tenantId, client.id, pagination);

    return {
      data: notifications,
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 10,
    };
  }

  @Post('notifications/:id/mark-read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  async markNotificationRead(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const client = this.getClientFromRequest(req);
    await this.notificationService.markAsReadForClient(client.tenantId, client.id, id);
    return { success: true };
  }

  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get client notification preferences' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiOkResponse({ type: ClientPortalNotificationPreferencesDto })
  async getNotificationPreferences(@Req() req: Request): Promise<ClientPortalNotificationPreferencesDto> {
    const client = this.getClientFromRequest(req);
    const prefs = client.notificationPreferences ?? { email: false, inApp: false };
    return {
      marketing: prefs.marketing ?? prefs.email,
      reminders: prefs.reminders ?? prefs.inApp,
      updates: prefs.updates ?? prefs.inApp,
    };
  }

  @Put('notifications/preferences')
  @ApiOperation({ summary: 'Update client notification preferences' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: ClientPortalNotificationPreferencesDto })
  @ApiOkResponse({ type: ClientPortalNotificationPreferencesDto })
  async updateNotificationPreferences(
    @Req() req: Request,
    @Body() dto: ClientPortalNotificationPreferencesDto,
  ): Promise<ClientPortalNotificationPreferencesDto> {
    const client = this.getClientFromRequest(req);
    await this.clientsService.update(client.id, {
      notificationPreferences: {
        email: dto.marketing,
        inApp: dto.reminders || dto.updates,
        marketing: dto.marketing,
        reminders: dto.reminders,
        updates: dto.updates,
      },
    });

    return dto;
  }

  private async resolveTenant(tenantSlug?: string): Promise<Tenant> {
    if (!tenantSlug) {
      throw new BadRequestException('tenantSlug is required');
    }
    return this.tenantsService.findBySlug(tenantSlug);
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
      tags: (servicePackage.packageItems ?? []).map((item) => item.taskType?.name).filter(Boolean) as string[],
    };
  }

  private buildDateRange(from: string, to: string): string[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException('Date format must be YYYY-MM-DD');
    }

    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException('Invalid availability date range');
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

  private mapBookingListItem(booking: Booking): ClientPortalBookingDetailsResponseDto {
    const date = booking.eventDate.toISOString().split('T')[0] ?? booking.eventDate.toISOString();
    const time = booking.startTime ?? '00:00';
    const portalMeta = this.parseBookingPortalMeta(booking.notes);

    return {
      id: booking.id,
      reference: this.buildBookingReference(booking.id, booking.createdAt),
      listingId: booking.packageId,
      listingTitle: booking.servicePackage?.name ?? 'Listing',
      location: undefined,
      date,
      time,
      guests: portalMeta.guests,
      status: this.mapBookingStatus(booking.status),
      createdAt: booking.createdAt,
      contactName: portalMeta.contactName,
      contactEmail: portalMeta.contactEmail,
      contactPhone: portalMeta.contactPhone,
      notes: portalMeta.notes,
      timeline: [
        { type: 'created', at: booking.createdAt },
        { type: 'scheduled', at: booking.eventDate },
      ],
    };
  }

  private mapBookingDetails(booking: Booking, client: Client): ClientPortalBookingDetailsResponseDto {
    const base = this.mapBookingListItem(booking);
    const timeline = [
      { type: 'created', at: booking.createdAt },
      { type: 'scheduled', at: booking.eventDate },
    ];
    if (booking.status === BookingStatus.CANCELLED && booking.cancelledAt) {
      timeline.push({ type: 'cancelled', at: booking.cancelledAt });
    }

    return {
      ...base,
      contactName: base.contactName ?? client.name,
      contactEmail: base.contactEmail ?? client.email,
      contactPhone: base.contactPhone ?? client.phone,
      notes: base.notes,
      timeline,
    };
  }

  private mapBookingStatus(status: BookingStatus): string {
    if (status === BookingStatus.CANCELLED) {
      return 'cancelled';
    }
    if (status === BookingStatus.COMPLETED) {
      return 'completed';
    }
    return 'upcoming';
  }

  private buildBookingReference(bookingId: string, createdAt: Date): string {
    const year = createdAt.getUTCFullYear();
    const suffix = bookingId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `BK-${year}-${suffix}`;
  }

  private serializeBookingPortalMeta(dto: ClientPortalCreateBookingRequestDto): string {
    return JSON.stringify({
      source: 'client-portal',
      guests: dto.guests,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      notes: dto.notes,
    });
  }

  private parseBookingPortalMeta(notes: string | null | undefined): {
    guests: number;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  } {
    if (!notes) {
      return { guests: 1 };
    }
    try {
      const parsed = JSON.parse(notes) as {
        guests?: number;
        contactName?: string;
        contactEmail?: string;
        contactPhone?: string;
        notes?: string;
      };
      return {
        guests: parsed.guests ?? 1,
        contactName: parsed.contactName,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        notes: parsed.notes,
      };
    } catch {
      return { guests: 1, notes };
    }
  }

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return client;
  }
}
