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
import { PaginationDto } from '../../common/dto/pagination.dto';
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
import { GetTenant } from './decorators/validate-tenant-slug.decorator';
import { ClientTokenResponseDto, RequestMagicLinkDto, VerifyMagicLinkDto } from './dto/client-auth.dto';
import { CreateClientBookingDto } from './dto/create-client-booking.dto';
import { UpdateClientProfileDto } from './dto/update-profile.dto';
import { ClientTokenGuard } from './guards/client-token.guard';
import { AvailabilityService } from './services/availability.service';
import { ClientAuthService } from './services/client-auth.service';
import { ClientPortalService } from './services/client-portal.service';

@ApiTags('Client Portal')
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
  ) {}

  @Post(':slug/auth/request-magic-link')
  @ApiOperation({ summary: 'Request a magic link login email' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
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

    const paginated = await this.catalogService.findAllPackagesWithFilters(filter);
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
    return this.clientPortalService.getBooking(id, client.id, client.tenantId);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create a new booking request (DRAFT status)' })
  @UseGuards(ClientTokenGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createBooking(@Req() req: Request, @Body() dto: CreateClientBookingDto): Promise<Booking> {
    const client = this.getClientFromRequest(req);
    return this.clientPortalService.createBooking(client, dto);
  }

  @Post('bookings/:id/review')
  @ApiOperation({ summary: 'Submit a review for a completed booking' })
  @UseGuards(ClientTokenGuard)
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
  async getProfile(@Req() req: Request): Promise<Partial<Client>> {
    const client = this.getClientFromRequest(req);
    return this.clientPortalService.getClientProfile(client.id, client.tenantId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update client profile' })
  @UseGuards(ClientTokenGuard)
  async updateProfile(@Req() req: Request, @Body() dto: UpdateClientProfileDto): Promise<Client> {
    const client = this.getClientFromRequest(req);
    const updateDto: UpdateClientDto = {};

    if (dto.name !== undefined) updateDto.name = dto.name;
    if (dto.phone !== undefined) updateDto.phone = dto.phone;

    if (dto.emailNotifications !== undefined || dto.inAppNotifications !== undefined) {
      const currentPrefs = client.notificationPreferences ?? { email: false, inApp: false };
      updateDto.notes = `notificationPreferences:${JSON.stringify({
        email: dto.emailNotifications ?? currentPrefs.email,
        inApp: dto.inAppNotifications ?? currentPrefs.inApp,
      })}`;
    }

    return this.clientsService.update(client.id, updateDto);
  }

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

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return client;
  }
}
