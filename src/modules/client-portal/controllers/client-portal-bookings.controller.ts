import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { NotificationService } from '../../notifications/services/notification.service';
import { CreateReviewDto } from '../../reviews/dto/create-review.dto';
import { ReviewsService } from '../../reviews/services/reviews.service';
import {
  ClientPortalBookingDetailsResponseDto,
  ClientPortalBookingsListResponseDto,
  ClientPortalCancelBookingRequestDto,
  ClientPortalCancelBookingResponseDto,
  ClientPortalCreateBookingRequestDto,
  ClientPortalCreateBookingResponseDto,
} from '../dto/client-portal-openapi.dto';
import { CreateClientBookingDto } from '../dto/create-client-booking.dto';
import { ClientTokenGuard } from '../guards/client-token.guard';
import { ClientPortalService } from '../services/client-portal.service';
import { toErrorMessage } from '../../../common/utils/error.util';

@ApiTags('Client Portal')
@Controller('client-portal')
@SkipTenant()
export class ClientPortalBookingsController {
  private readonly logger = new Logger(ClientPortalBookingsController.name);

  constructor(
    private readonly clientPortalService: ClientPortalService,
    private readonly reviewsService: ReviewsService,
    private readonly notificationService: NotificationService,
  ) {}

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
    const result = await TenantContextService.run(client.tenantId, async () =>
      this.clientPortalService.getMyBookingsPaginated(client.id, client.tenantId, currentPage, currentPageSize),
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
    const booking = await TenantContextService.run(client.tenantId, async () =>
      this.clientPortalService.getBooking(id, client.id, client.tenantId),
    );
    return this.mapBookingDetails(booking, client);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create a new client portal booking' })
  @UseGuards(ClientTokenGuard)
  @ApiSecurity('client-token')
  @ApiBody({ type: ClientPortalCreateBookingRequestDto })
  @ApiResponse({ status: 201, type: ClientPortalCreateBookingResponseDto })
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
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
    const booking = await TenantContextService.run(client.tenantId, async () =>
      this.clientPortalService.createBooking(client, createDto),
    );

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
    const booking = await TenantContextService.run(client.tenantId, async () =>
      this.clientPortalService.cancelMyBooking(id, client.id, client.tenantId, dto.reason),
    );

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
      throw new BadRequestException('client_portal.review_completed_only');
    }

    const review = await TenantContextService.run(client.tenantId, async () => {
      const duplicate = await this.reviewsService.checkDuplicateReview(client.id, bookingId);
      if (duplicate) {
        throw new ConflictException('client_portal.review_already_submitted');
      }

      return this.reviewsService.create(client.id, bookingId, booking.packageId, dto);
    });

    if (client.notificationPreferences?.inApp) {
      await this.notificationService.create({
        tenantId: client.tenantId,
        clientId: client.id,
        userId: null,
        type: NotificationType.SYSTEM_ALERT,
        title: 'notifications.messages.reviewSubmittedTitle',
        message: 'notifications.messages.reviewSubmittedMessage',
        metadata: { reviewId: review.id },
      });
    }

    return review;
  }

  private getClientFromRequest(req: Request): Client {
    const client = (req as Request & { client?: Client }).client;
    if (!client) {
      throw new UnauthorizedException('auth.invalid_or_expired_token');
    }
    return client;
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
    } catch (error) {
      this.logger.warn(
        `parseBookingNotes: failed to parse JSON notes, falling back to plain string: ${toErrorMessage(error)}`,
      );
      return { guests: 1, notes };
    }
  }
}
