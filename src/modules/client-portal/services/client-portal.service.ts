import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateBookingDto } from '../../bookings/dto';
import { Booking } from '../../bookings/entities/booking.entity';
import { Client } from '../../bookings/entities/client.entity';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { BookingRepository } from '../../bookings/repositories/booking.repository';
import { BookingsService } from '../../bookings/services/bookings.service';
import { PackageFilterDto } from '../../catalog/dto/package-filter.dto';
import { ServicePackage } from '../../catalog/entities/service-package.entity';
import { CatalogService } from '../../catalog/services/catalog.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { NotificationService } from '../../notifications/services/notification.service';
import { ReviewsService } from '../../reviews/services/reviews.service';
import { Task } from '../../tasks/entities/task.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
import {
  ClientPortalListingsQueryDto,
  ClientPortalListingsResponseDto,
  ClientPortalListingSummaryDto,
} from '../dto/client-portal-openapi.dto';
import { CreateClientBookingDto } from '../dto/create-client-booking.dto';
import { AvailabilityService } from './availability.service';

@Injectable()
export class ClientPortalService {
  constructor(
    @Inject(TENANT_REPO_CLIENT)
    private readonly clientRepository: TenantAwareRepository<Client>,
    private readonly bookingRepository: BookingRepository,
    private readonly bookingsService: BookingsService,
    private readonly catalogService: CatalogService,
    private readonly reviewsService: ReviewsService,
    private readonly tenantsService: TenantsService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationService: NotificationService,
  ) {}

  async getListingsForTenant(
    tenant: Tenant,
    query: ClientPortalListingsQueryDto,
  ): Promise<ClientPortalListingsResponseDto> {
    const filter = this.buildPackageFilter(query.search, query.page ?? 1, query.pageSize ?? 6);
    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    const items = this.filterByTenantAndPrice(paginated.data, tenant.id, query.minPrice, query.maxPrice);
    const listingItems = await this.mapListingSummariesWithAggregates(items, tenant);

    return {
      items: listingItems,
      total: paginated.meta.totalItems,
      page: paginated.meta.page,
      pageSize: paginated.meta.pageSize,
    };
  }

  async getFeaturedListingsForTenant(tenant: Tenant): Promise<ClientPortalListingSummaryDto[]> {
    const filter = this.buildPackageFilter(undefined, 1, 6);
    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    const items = paginated.data.filter((pkg) => pkg.tenantId === tenant.id && pkg.isActive).slice(0, 6);
    return this.mapListingSummariesWithAggregates(items, tenant);
  }

  async getPackagesForTenant(
    tenant: Tenant,
    search?: string,
    priceMin?: number,
    priceMax?: number,
    page = 1,
    limit = 10,
  ): Promise<{ data: ServicePackage[]; total: number; page: number; limit: number }> {
    const filter = this.buildPackageFilter(search, page, limit);
    const paginated = await TenantContextService.run(tenant.id, async () =>
      this.catalogService.findAllPackagesWithFilters(filter),
    );
    const data = this.filterByTenantAndPrice(paginated.data, tenant.id, priceMin, priceMax);

    return {
      data,
      total: paginated.meta.totalItems,
      page: paginated.meta.page,
      limit: paginated.meta.pageSize,
    };
  }

  async getClientProfile(clientId: string, tenantId: string): Promise<Partial<Client>> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });

    if (!client || client.tenantId !== tenantId) {
      throw new NotFoundException('Client not found');
    }

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
    };
  }

  async getMyBookings(
    clientId: string,
    _tenantId: string, // Kept for API compatibility; TenantAwareRepository handles scoping
    query: { getSkip(): number; getTake(): number } = { getSkip: () => 0, getTake: () => 20 },
  ): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { clientId },
      relations: ['servicePackage'],
      order: { eventDate: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async getMyBookingsPaginated(
    clientId: string,
    _tenantId: string,
    page = 1,
    pageSize = 10,
  ): Promise<{ items: Booking[]; total: number; page: number; pageSize: number }> {
    const [items, total] = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .andWhere('booking.clientId = :clientId', { clientId })
      .orderBy('booking.eventDate', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { items, total, page, pageSize };
  }

  async getBooking(bookingId: string, clientId: string, _tenantId: string): Promise<Booking> {
    const booking = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect(Task, 'tasks', 'tasks.bookingId = booking.id AND tasks.tenantId = booking.tenantId')
      .where('booking.id = :bookingId', { bookingId })
      .andWhere('booking.clientId = :clientId', { clientId })
      .getOne();

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async createBooking(client: Client, dto: CreateClientBookingDto): Promise<Booking> {
    const tenant = await this.tenantsService.findOne(client.tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const eventDate = this.toUtcDate(dto.eventDate);
    this.validateNoticePeriod(eventDate, tenant);

    const servicePackage = await this.catalogService.findPackageById(dto.packageId);
    if (!servicePackage || servicePackage.tenantId !== client.tenantId) {
      throw new NotFoundException('Package not found');
    }

    await this.ensureSlotCapacity(dto.packageId, eventDate, dto.startTime, tenant);

    const bookingInput: CreateBookingDto = {
      clientId: client.id,
      packageId: dto.packageId,
      eventDate: eventDate.toISOString(),
      notes: dto.notes,
      taxRate: tenant.defaultTaxRate ?? 0,
      depositPercentage: 0,
      startTime: dto.startTime,
    };

    const savedBooking = await TenantContextService.run(client.tenantId, async () => {
      return this.bookingsService.create(bookingInput);
    });

    await this.availabilityService.invalidateAvailabilityCache(client.tenantId, dto.packageId, dto.eventDate);
    await this.sendBookingNotifications(client, tenant, savedBooking);

    return savedBooking;
  }

  async cancelMyBooking(bookingId: string, clientId: string, tenantId: string, reason?: string): Promise<Booking> {
    const booking = await this.getBooking(bookingId, clientId, tenantId);

    if (!booking.canBeCancelled()) {
      throw new BadRequestException('Booking cannot be cancelled in its current status');
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    if (reason) {
      booking.cancellationReason = reason;
    }

    return this.bookingRepository.save(booking);
  }

  private async ensureSlotCapacity(
    packageId: string,
    eventDate: Date,
    startTime: string,
    tenant: Tenant,
  ): Promise<void> {
    const confirmedCount = await this.bookingRepository.count({
      where: {
        packageId,
        eventDate,
        startTime,
        status: BookingStatus.CONFIRMED,
      },
    });

    const maxConcurrent = tenant.maxConcurrentBookingsPerSlot ?? 1;
    if (confirmedCount >= maxConcurrent) {
      throw new ConflictException('Selected time slot is fully booked');
    }
  }

  private validateNoticePeriod(eventDate: Date, tenant: Tenant): void {
    const minNoticeHours = tenant.minimumNoticePeriodHours ?? 24;
    const minDate = new Date(Date.now() + minNoticeHours * 60 * 60 * 1000);
    if (eventDate < minDate) {
      throw new BadRequestException(`Booking requires at least ${minNoticeHours} hours notice`);
    }
  }

  private toUtcDate(date: string): Date {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const year = parseInt(yearStr || '0', 10);
    const month = parseInt(monthStr || '0', 10);
    const day = parseInt(dayStr || '0', 10);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private async sendBookingNotifications(client: Client, tenant: Tenant, booking: Booking): Promise<void> {
    if (client.notificationPreferences?.inApp) {
      await this.notificationService.create({
        tenantId: client.tenantId,
        clientId: client.id,
        userId: null,
        type: NotificationType.BOOKING_CREATED,
        title: 'Booking Request Submitted',
        message: 'Your booking request has been submitted and is pending approval.',
        metadata: { bookingId: booking.id },
      });
    }

    if (tenant.notificationEmails && tenant.notificationEmails.length > 0) {
      // Mail dispatch intentionally handled by existing async handlers.
    }
  }

  private buildPackageFilter(search: string | undefined, page: number, limit: number): PackageFilterDto {
    const filter = new PackageFilterDto();
    filter.search = search;
    filter.isActive = true;
    filter.page = page;
    filter.limit = limit;
    return filter;
  }

  private filterByTenantAndPrice(
    packages: ServicePackage[],
    tenantId: string,
    priceMin?: number,
    priceMax?: number,
  ): ServicePackage[] {
    let filtered = packages.filter((pkg) => pkg.tenantId === tenantId && pkg.isActive);

    if (priceMin !== undefined) {
      filtered = filtered.filter((pkg) => Number(pkg.price) >= Number(priceMin));
    }
    if (priceMax !== undefined) {
      filtered = filtered.filter((pkg) => Number(pkg.price) <= Number(priceMax));
    }

    return filtered;
  }

  private async mapListingSummariesWithAggregates(
    packages: ServicePackage[],
    tenant: Tenant,
  ): Promise<ClientPortalListingSummaryDto[]> {
    const reviewAggregates = await TenantContextService.run(tenant.id, async () =>
      this.reviewsService.getApprovedAggregatesByPackageIds(packages.map((pkg) => pkg.id)),
    );
    const reviewStatsByPackageId = new Map(reviewAggregates.map((aggregate) => [aggregate.packageId, aggregate]));

    return packages.map((servicePackage) => {
      const aggregate = reviewStatsByPackageId.get(servicePackage.id);
      return this.mapListingSummary(servicePackage, tenant, aggregate?.avgRating ?? 0, aggregate?.reviewCount ?? 0);
    });
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
}
