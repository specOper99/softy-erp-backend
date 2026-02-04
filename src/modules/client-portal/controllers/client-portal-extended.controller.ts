import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { CatalogService } from '../../catalog/services/catalog.service';
import { PackageFilterDto } from '../../catalog/dto/package-filter.dto';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { NotificationService } from '../../notifications/services/notification.service';
import { CreateReviewDto } from '../../reviews/dto/create-review.dto';
import { ReviewResponseDto } from '../../reviews/dto/review-response.dto';
import { ReviewsService } from '../../reviews/services/reviews.service';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { ClientsService } from '../../bookings/services/clients.service';
import { UpdateClientDto } from '../../bookings/dto/client.dto';
import { GetTenant } from '../decorators/validate-tenant-slug.decorator';
import { ClientTokenResponseDto, RequestMagicLinkDto, VerifyMagicLinkDto } from '../dto/client-auth.dto';
import { CreateClientBookingDto } from '../dto/create-client-booking.dto';
import { UpdateClientProfileDto } from '../dto/update-profile.dto';
import { ClientTokenGuard } from '../guards/client-token.guard';
import { AvailabilityService } from '../services/availability.service';
import { ClientAuthService } from '../services/client-auth.service';
import { ClientPortalService } from '../services/client-portal.service';

@ApiTags('Client Portal')
@ApiHeader({
  name: 'x-client-token',
  description: 'Magic link access token for the client',
  required: false,
})
@Controller('client-portal')
@SkipTenant() // Client portal uses its own authentication, not JWT
export class ClientPortalController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientPortalService: ClientPortalService,
    private readonly catalogService: CatalogService,
    private readonly reviewsService: ReviewsService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationService: NotificationService,
    private readonly tenantsService: TenantsService,
    private readonly clientsService: ClientsService,
    private readonly dataSource: DataSource,
  ) {}

  // ============ AUTHENTICATION ============

  @Post(':slug/auth/request-magic-link')
  @ApiOperation({ summary: 'Request a magic link login email' })
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 requests per minute
  async requestMagicLink(@Param('slug') slug: string, @Body() dto: RequestMagicLinkDto): Promise<{ message: string }> {
    return this.clientAuthService.requestMagicLink(slug, dto.email);
  }

  @Post('auth/verify')
  @ApiOperation({ summary: 'Verify magic link token and get access token' })
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto): Promise<ClientTokenResponseDto> {
    const result = await this.clientAuthService.verifyMagicLink(dto.token);
    return {
      accessToken: result.accessToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000),
      client: {
        id: result.client.id,
        name: result.client.name,
        email: result.client.email,
      },
    };
  }

  @Post('auth/logout')
  @ApiOperation({ summary: 'Logout and invalidate token' })
  @UseGuards(ClientTokenGuard)
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const token = req.headers['x-client-token'] as string;
    await this.clientAuthService.logout(token);
    return { message: 'Logged out successfully' };
  }

  // ============ PACKAGES (CATALOG) ============

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
    // Use CatalogService to fetch packages (ensures tenant scoping and caching)
    const filter = new PackageFilterDto();
    filter.search = search;
    filter.isActive = true;
    filter.page = pagination.page ?? 1;
    filter.limit = pagination.limit ?? 10;

    const paginated = await this.catalogService.findAllPackagesWithFilters(filter);

    // filter by price range if provided (server-side filtering not currently implemented in DTO)
    let data = paginated.data;
    if (priceMin !== undefined) data = data.filter((p) => Number(p.price) >= Number(priceMin));
    if (priceMax !== undefined) data = data.filter((p) => Number(p.price) <= Number(priceMax));

    return { data, total: paginated.meta.totalItems, page: paginated.meta.page, limit: paginated.meta.pageSize };
  }

  @Get(':slug/packages/:id')
  @ApiOperation({ summary: 'Get package details by ID' })
  async getPackage(@GetTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string): Promise<ServicePackage> {
    const servicePackage = await this.catalogService.findPackageById(id);
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

  // ============ BOOKINGS ============

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings for the authenticated client' })
  @UseGuards(ClientTokenGuard)
  async getMyBookings(@Req() req: Request, @Query() query: PaginationDto = new PaginationDto()): Promise<Booking[]> {
    const client = this.getClientFromRequest(req);
    return this.clientPortalService.getMyBookings(client.id, client.tenantId, query);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get a specific booking' })
  @UseGuards(ClientTokenGuard)
  async getBooking(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<Booking> {
    const client = this.getClientFromRequest(req);
    const booking = await this.clientPortalService.getBooking(id, client.id, client.tenantId);

    if (!booking) {
      throw new UnauthorizedException('Booking not found');
    }

    return booking;
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create a new booking request (DRAFT status)' })
  @UseGuards(ClientTokenGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 bookings per minute
  async createBooking(@Req() req: Request, @Body() dto: CreateClientBookingDto): Promise<Booking> {
    const client = this.getClientFromRequest(req);

    // Get tenant
    const tenant = await this.tenantsService.findOne(client.tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Validate notice period
    const [yearStr, monthStr, dayStr] = dto.eventDate.split('-');
    const eventDate = new Date(
      Date.UTC(parseInt(yearStr || '0', 10), parseInt(monthStr || '0', 10) - 1, parseInt(dayStr || '0', 10)),
    );
    const now = new Date();
    const minNoticeDays = (tenant.minimumNoticePeriodHours ?? 24) / 24;
    const minDate = new Date(now.getTime() + minNoticeDays * 24 * 60 * 60 * 1000);

    if (eventDate < minDate) {
      throw new BadRequestException(`Booking requires at least ${tenant.minimumNoticePeriodHours} hours notice`);
    }

    // Get package
    const servicePackage = await this.catalogService.findPackageById(dto.packageId);
    if (!servicePackage || servicePackage.tenantId !== client.tenantId) {
      throw new NotFoundException('Package not found');
    }

    // Use transaction with pessimistic locking
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock overlapping bookings
      const overlappingBookings = await queryRunner.manager
        .createQueryBuilder(Booking, 'booking')
        .setLock('pessimistic_write')
        .where('booking.tenantId = :tenantId', { tenantId: client.tenantId })
        .andWhere('booking.packageId = :packageId', { packageId: dto.packageId })
        .andWhere('booking.eventDate = :eventDate', { eventDate })
        .andWhere('booking.startTime = :startTime', { startTime: dto.startTime })
        .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
        .getMany();

      // Check capacity
      const maxConcurrent = tenant.maxConcurrentBookingsPerSlot ?? 1;
      if (overlappingBookings.length >= maxConcurrent) {
        throw new ConflictException('Selected time slot is fully booked');
      }

      // Create booking
      const booking = queryRunner.manager.create(Booking, {
        tenantId: client.tenantId,
        clientId: client.id,
        packageId: dto.packageId,
        eventDate,
        startTime: dto.startTime,
        status: BookingStatus.DRAFT,
        totalPrice: servicePackage.price,
        subTotal: servicePackage.price,
        taxRate: tenant.defaultTaxRate ?? 0,
        taxAmount: (servicePackage.price * (tenant.defaultTaxRate ?? 0)) / 100,
        depositPercentage: 0,
        depositAmount: 0,
        amountPaid: 0,
        notes: dto.notes,
      });

      const savedBooking = await queryRunner.manager.save(booking);

      await queryRunner.commitTransaction();

      // Invalidate availability cache
      await this.availabilityService.invalidateAvailabilityCache(client.tenantId, dto.packageId, dto.eventDate);

      // Send notifications
      await this.sendBookingNotifications(client, tenant, savedBooking, servicePackage);

      return savedBooking;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @Post('bookings/:id/review')
  @ApiOperation({ summary: 'Submit a review for a completed booking' })
  @UseGuards(ClientTokenGuard)
  async submitReview(@Req() req: Request, @Param('id', ParseUUIDPipe) bookingId: string, @Body() dto: CreateReviewDto) {
    const client = this.getClientFromRequest(req);

    // Verify booking exists, belongs to client, and is completed
    const booking = await this.clientPortalService.getBooking(bookingId, client.id, client.tenantId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Check for duplicate review
    const duplicate = await this.reviewsService.checkDuplicateReview(client.tenantId, client.id, bookingId);
    if (duplicate) {
      throw new ConflictException('You have already reviewed this booking');
    }

    // Create review
    const review = await this.reviewsService.create(client.tenantId, client.id, bookingId, booking.packageId, dto);

    // Notify client
    if (client.notificationPreferences.inApp) {
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

  // ============ PROFILE ============

  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated client profile' })
  @UseGuards(ClientTokenGuard)
  async getProfile(@Req() req: Request): Promise<Partial<Client>> {
    const client = this.getClientFromRequest(req);
    return this.clientPortalService.getClientProfile(client.id, client.tenantId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update client profile' })
  @UseGuards(ClientTokenGuard)
  async updateProfile(@Req() req: Request, @Body() dto: UpdateClientProfileDto): Promise<Client> {
    const client = this.getClientFromRequest(req);

    const updateData: Partial<Client> = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.emailNotifications !== undefined || dto.inAppNotifications !== undefined) {
      updateData.notificationPreferences = {
        email: dto.emailNotifications ?? client.notificationPreferences.email,
        inApp: dto.inAppNotifications ?? client.notificationPreferences.inApp,
      };
    }

    // Update via ClientsService to ensure tenant scoping and audit
    const updateDto: UpdateClientDto = {};
    if (updateData.name !== undefined) updateDto.name = updateData.name;
    if (updateData.phone !== undefined) updateDto.phone = updateData.phone;
    if (updateData.email !== undefined) updateDto.email = updateData.email;
    if (updateData.notificationPreferences !== undefined) {
      // Map notification preferences into notes or a suitable field; keep it simple and store as notes for now
      updateDto.notes = `notificationPreferences:${JSON.stringify(updateData.notificationPreferences)}`;
    }

    const updatedClient = await this.clientsService.update(client.id, updateDto);
    return updatedClient;
  }

  // ============ NOTIFICATIONS ============

  @Get('notifications')
  @ApiOperation({ summary: 'Get client notifications' })
  @UseGuards(ClientTokenGuard)
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
  async markNotificationRead(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const client = this.getClientFromRequest(req);
    await this.notificationService.markAsReadForClient(client.tenantId, client.id, id);
    return { success: true };
  }

  // ============ HELPERS ============

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return client;
  }

  private async sendBookingNotifications(
    client: Client,
    tenant: Tenant,
    booking: Booking,
    servicePackage: ServicePackage,
  ): Promise<void> {
    // Email to client
    if (client.notificationPreferences.email && client.email) {
      // TODO: Send email via email service with template 'booking-request-client.hbs'
    }

    // In-app notification to client
    if (client.notificationPreferences.inApp) {
      await this.notificationService.create({
        tenantId: client.tenantId,
        clientId: client.id,
        userId: null,
        type: NotificationType.BOOKING_CREATED,
        title: 'Booking Request Submitted',
        message: `Your booking request for "${servicePackage.name}" has been submitted and is pending approval.`,
        metadata: { bookingId: booking.id },
      });
    }

    // Email to tenant admins
    if (tenant.notificationEmails && tenant.notificationEmails.length > 0) {
      // TODO: Send emails to tenant.notificationEmails with template 'booking-request-admin.hbs'
    }
  }
}
