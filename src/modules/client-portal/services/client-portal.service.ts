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
import { CatalogService } from '../../catalog/services/catalog.service';
import { NotificationType } from '../../notifications/enums/notification.enum';
import { NotificationService } from '../../notifications/services/notification.service';
import { Task } from '../../tasks/entities/task.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantsService } from '../../tenants/tenants.service';
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
    private readonly tenantsService: TenantsService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationService: NotificationService,
  ) {}

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
}
