import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import {
  BookingFilterDto,
  CreateBookingDto,
  RecordPaymentDto,
  UpdateBookingDto,
} from '../dto';
import { Booking } from '../entities/booking.entity';

import { BookingStatus } from '../enums/booking-status.enum';
import { BookingUpdatedEvent } from '../events/booking-updated.event';
import { PaymentRecordedEvent } from '../events/payment-recorded.event';

import { BookingStateMachineService } from './booking-state-machine.service';

import { BookingRepository } from '../repositories/booking.repository';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly catalogService: CatalogService,

    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,

    private readonly dashboardGateway: DashboardGateway,
    private readonly stateMachine: BookingStateMachineService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    // Validate package exists and get price
    const pkg = await this.catalogService.findPackageById(dto.packageId);

    // Validate event date is at least 1 hour in the future
    const eventDate = new Date(dto.eventDate);
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (eventDate < oneHourFromNow) {
      throw new BadRequestException('booking.event_date_must_be_future');
    }

    // Validate tax rate bounds (max 50% per business rule)
    const taxRate = dto.taxRate ?? 0;
    if (taxRate < 0 || taxRate > 50) {
      throw new BadRequestException('booking.invalid_tax_rate');
    }

    const subTotal = Number(pkg.price);
    const taxAmount = Number(subTotal * (taxRate / 100));
    const totalPrice = subTotal + taxAmount;

    const booking = this.bookingRepository.create({
      clientId: dto.clientId,
      eventDate: new Date(dto.eventDate),
      packageId: dto.packageId,
      notes: dto.notes,
      subTotal,
      taxRate,
      taxAmount,
      totalPrice,
      status: BookingStatus.DRAFT,
    });

    const savedBooking = await this.bookingRepository.save(booking);

    // Notify dashboard for real-time update
    this.dashboardGateway.broadcastMetricsUpdate(tenantId, 'BOOKING', {
      action: 'CREATED',
      bookingId: savedBooking.id,
    });

    return savedBooking;
  }

  async findAll(
    query: BookingFilterDto = new BookingFilterDto(),
  ): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect('booking.tasks', 'tasks')
      .leftJoinAndSelect('tasks.assignedUser', 'taskAssignedUser')
      .where('booking.tenantId = :tenantId', { tenantId });

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    qb.orderBy(`booking.${sortBy}`, sortOrder);

    qb.skip(query.getSkip()).take(query.getTake());

    if (query.search) {
      qb.andWhere(
        '(client.name ILIKE :search OR client.email ILIKE :search OR booking.notes ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status && query.status.length > 0) {
      // If status comes as a single string (from query params issue), wrap it
      const statuses = Array.isArray(query.status)
        ? query.status
        : [query.status];
      qb.andWhere('booking.status IN (:...statuses)', { statuses });
    }

    if (query.startDate) {
      qb.andWhere('booking.eventDate >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('booking.eventDate <= :endDate', {
        endDate: query.endDate,
      });
    }

    if (query.packageId) {
      qb.andWhere('booking.packageId = :packageId', {
        packageId: query.packageId,
      });
    }

    if (query.clientId) {
      qb.andWhere('booking.clientId = :clientId', {
        clientId: query.clientId,
      });
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('booking.totalPrice >= :minPrice', {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('booking.totalPrice <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }

    return qb.getMany();
  }

  async findAllCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: Booking[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .where('booking.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'booking',
    });
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: [
        'client',
        'servicePackage',
        'servicePackage.packageItems',
        'servicePackage.packageItems.taskType',
        'tasks',
        'tasks.assignedUser',
        'tasks.taskType',
      ],
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  // No changes needed for update method logic itself as it uses findOne which is now scoped.
  // But wait, the previous `findOne` usage in `update` is fine.
  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.findOne(id);

    // SECURITY: Only allow limited updates on non-draft bookings
    if (booking.status !== BookingStatus.DRAFT) {
      const allowedUpdates = ['status', 'notes'];
      const attemptedUpdates = Object.keys(dto).filter(
        (k) => dto[k as keyof UpdateBookingDto] !== undefined,
      );
      const disallowed = attemptedUpdates.filter(
        (k) => !allowedUpdates.includes(k),
      );
      if (disallowed.length > 0) {
        throw new BadRequestException('booking.cannot_update_non_draft');
      }
    }

    if (dto.status && dto.status !== booking.status) {
      this.stateMachine.validateTransition(booking.status, dto.status);
    }

    if (dto.eventDate) {
      booking.eventDate = new Date(dto.eventDate);
    }

    Object.assign(booking, {
      ...dto,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : booking.eventDate,
    });

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      return manager.save(booking);
    });

    // Publish event AFTER transaction commits successfully
    this.eventBus.publish(
      new BookingUpdatedEvent(
        savedBooking.id,
        savedBooking.tenantId,
        { ...dto } as Record<string, unknown>,
        new Date(),
      ),
    );

    return savedBooking;
  }

  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('booking.can_only_delete_draft');
    }
    await this.bookingRepository.softRemove(booking);
  }

  async recordPayment(id: string, dto: RecordPaymentDto): Promise<void> {
    const booking = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      // 1. Record the financial transaction
      // Note: We need a version of createTransaction that accepts a manager
      // or we can use the manager to save directly if we want to bypass the service wrapper,
      // but better to expose a 'withManager' method in FinanceService if possible.
      // For now, let's look at FinanceService. It has createTransactionWithManager.

      await this.financeService.createTransactionWithManager(manager, {
        type: TransactionType.INCOME,
        amount: dto.amount,
        description: `Payment for booking ${booking.client?.name || 'Client'} - ${dto.paymentMethod || 'Manual'}`,
        bookingId: booking.id,
        category: 'Booking Payment',
        transactionDate: new Date(),
      });

      // 2. Update the booking's amountPaid field atomically
      // This was missing in the original implementation!
      const currentPaid = Number(booking.amountPaid || 0);
      const newPaid = MathUtils.add(currentPaid, dto.amount);

      await manager.update(
        Booking,
        { id: booking.id },
        {
          amountPaid: newPaid,
          updatedAt: new Date(),
        },
      );

      // Update local object for event
      booking.amountPaid = newPaid;
    });

    this.eventBus.publish(
      new PaymentRecordedEvent(
        booking.id,
        booking.tenantId,
        booking.client?.email || '',
        booking.client?.name || '',
        booking.eventDate,
        dto.amount,
        dto.paymentMethod || 'Manual',
        dto.reference || '',
        Number(booking.totalPrice),
        Number(booking.amountPaid),
      ),
    );
  }
}
