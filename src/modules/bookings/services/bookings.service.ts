import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { CatalogService } from '../../catalog/services/catalog.service';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import {
  BookingFilterDto,
  BookingSortBy,
  CreateBookingDto,
  MarkBookingPaidDto,
  RecordPaymentDto,
  SortOrder,
  UpdateBookingDto,
} from '../dto';
import { Booking } from '../entities/booking.entity';

import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingUpdatedEvent } from '../events/booking-updated.event';
import { PaymentRecordedEvent } from '../events/payment-recorded.event';

import { BookingStateMachineService } from './booking-state-machine.service';

import { BookingRepository } from '../repositories/booking.repository';
import { BookingPriceCalculator } from '../utils/booking-price.calculator';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly catalogService: CatalogService,

    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly stateMachine: BookingStateMachineService,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    // Validate package exists and get price
    const pkg = await this.catalogService.findPackageById(dto.packageId);

    // Validate event date is at least 1 hour in the future
    const eventDate = new Date(dto.eventDate);
    const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
    if (eventDate < oneHourFromNow) {
      throw new BadRequestException('booking.event_date_must_be_future');
    }

    // Validate tax rate bounds (max 50% per business rule)
    const taxRate = dto.taxRate ?? 0;
    if (taxRate < 0 || taxRate > BUSINESS_CONSTANTS.BOOKING.MAX_TAX_RATE_PERCENT) {
      throw new BadRequestException('booking.invalid_tax_rate');
    }

    const priceInput = {
      packagePrice: Number(pkg.price),
      taxRate: dto.taxRate ?? 0,
      depositPercentage: dto.depositPercentage ?? 0,
    };

    // Validate deposit percentage bounds
    if (priceInput.depositPercentage < 0 || priceInput.depositPercentage > 100) {
      throw new BadRequestException('booking.invalid_deposit_percentage');
    }

    const pricing = BookingPriceCalculator.calculate(priceInput);

    const booking = this.bookingRepository.create({
      clientId: dto.clientId,
      eventDate: new Date(dto.eventDate),
      packageId: dto.packageId,
      notes: dto.notes,
      startTime: dto.startTime ?? null,
      subTotal: pricing.subTotal,
      taxRate: pricing.taxRate,
      taxAmount: pricing.taxAmount,
      totalPrice: pricing.totalPrice,
      status: BookingStatus.DRAFT,
      depositPercentage: pricing.depositPercentage,
      depositAmount: pricing.depositAmount,
    });

    const savedBooking = await this.bookingRepository.save(booking);

    // Publish domain event for cross-module reactions
    this.eventBus.publish(
      new BookingCreatedEvent(
        savedBooking.id,
        tenantId,
        savedBooking.clientId,
        '', // clientEmail - will be populated by handler if needed
        '', // clientName - will be populated by handler if needed
        savedBooking.packageId,
        pkg.name,
        savedBooking.totalPrice,
        null, // assignedUserId - no assignment at creation
        savedBooking.eventDate,
        savedBooking.createdAt,
      ),
    );

    if (savedBooking.eventDate && savedBooking.packageId) {
      try {
        const dateStr = savedBooking.eventDate.toISOString().split('T')[0];
        const pkgId = savedBooking.packageId as string;
        if (pkgId) {
          const pkgIdStr: string = String(pkgId);
          await this.cacheUtils.del(`availability:${tenantId}:${pkgIdStr}:${dateStr}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to invalidate availability cache: ${message}`);
      }
    }

    return savedBooking;
  }

  async findAll(query: BookingFilterDto = new BookingFilterDto(), user?: User): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect(Task, 'tasks', 'tasks.bookingId = booking.id AND tasks.tenantId = booking.tenantId')
      .leftJoinAndSelect('tasks.assignedUser', 'taskAssignedUser')
      .where('booking.tenantId = :tenantId', { tenantId });

    const sortOrder = query.sortOrder === SortOrder.Asc ? SortOrder.Asc : SortOrder.Desc;

    const SORT_COLUMNS: Record<BookingSortBy, string> = {
      [BookingSortBy.CreatedAt]: 'booking.createdAt',
      [BookingSortBy.EventDate]: 'booking.eventDate',
      [BookingSortBy.TotalPrice]: 'booking.totalPrice',
    };

    const sortBy: BookingSortBy =
      query.sortBy && Object.values(BookingSortBy).includes(query.sortBy) ? query.sortBy : BookingSortBy.CreatedAt;

    qb.orderBy(SORT_COLUMNS[sortBy], sortOrder);

    qb.skip(query.getSkip()).take(query.getTake());

    if (query.search) {
      // Validate and sanitize search parameter
      const trimmed = query.search.trim();
      if (trimmed.length >= BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH) {
        const sanitized = trimmed.slice(0, BUSINESS_CONSTANTS.SEARCH.MAX_LENGTH).replace(/[%_]/g, '');
        if (sanitized.length >= BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH) {
          qb.andWhere('(client.name ILIKE :search OR client.email ILIKE :search OR booking.notes ILIKE :search)', {
            search: `%${sanitized}%`,
          });
        }
      }
    }

    if (query.status && query.status.length > 0) {
      // If status comes as a single string (from query params issue), wrap it
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      qb.andWhere('booking.status IN (:...statuses)', { statuses });
    }

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      qb.innerJoin(Task, 'task', 'task.bookingId = booking.id AND task.tenantId = booking.tenantId');
      qb.andWhere('task.assignedUserId = :userId', { userId: user.id });
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
    user?: User,
  ): Promise<{ data: Booking[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .where('booking.tenantId = :tenantId', { tenantId });

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      qb.innerJoin(Task, 'task', 'task.bookingId = booking.id AND task.tenantId = booking.tenantId');
      qb.andWhere('task.assignedUserId = :userId', { userId: user.id });
    }

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'booking',
    });
  }

  async findOne(id: string, user?: User): Promise<Booking> {
    const qb = this.bookingRepository.createQueryBuilder('booking');
    qb.andWhere('booking.id = :id', { id });

    // Apply standard relations
    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndMapMany(
        'servicePackage.packageItems',
        PackageItem,
        'packageItems',
        'packageItems.packageId = servicePackage.id AND packageItems.tenantId = servicePackage.tenantId',
      )
      .leftJoinAndSelect('packageItems.taskType', 'packageTaskType')
      .leftJoinAndSelect(Task, 'tasks', 'tasks.bookingId = booking.id AND tasks.tenantId = booking.tenantId')
      .leftJoinAndSelect('tasks.assignedUser', 'assignedUser')
      .leftJoinAndSelect('tasks.taskType', 'taskTaskType');

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      qb.andWhere('EXISTS (SELECT 1 FROM task t WHERE t."bookingId" = booking.id AND t."assignedUserId" = :userId)', {
        userId: user.id,
      });
    }

    const booking = await qb.getOne();
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  // No changes needed for update method logic itself as it uses findOne which is now scoped.
  // But wait, the previous `findOne` usage in `update` is fine.
  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    // Initial fetch for validation (outside transaction)
    const existingBooking = await this.findOne(id);

    // SECURITY: Only allow limited updates on non-draft bookings
    if (existingBooking.status !== BookingStatus.DRAFT) {
      const allowedUpdates = ['status', 'notes'];
      const attemptedUpdates = Object.keys(dto).filter((k) => dto[k as keyof UpdateBookingDto] !== undefined);
      const disallowed = attemptedUpdates.filter((k) => !allowedUpdates.includes(k));
      if (disallowed.length > 0) {
        throw new BadRequestException('booking.cannot_update_non_draft');
      }
    }

    if (dto.status && dto.status !== existingBooking.status) {
      this.stateMachine.validateTransition(existingBooking.status, dto.status);
    }

    if (dto.eventDate) {
      const eventDate = new Date(dto.eventDate);
      const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
      if (eventDate < oneHourFromNow) {
        throw new BadRequestException('booking.event_date_must_be_future');
      }
    }

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      // Re-fetch with pessimistic lock inside transaction to prevent lost updates
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId: existingBooking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (dto.eventDate) {
        booking.eventDate = new Date(dto.eventDate);
      }

      Object.assign(booking, {
        ...dto,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : booking.eventDate,
      });

      return manager.save(booking);
    });

    // Publish event AFTER transaction commits successfully
    const allowedChanges: Record<string, unknown> = {};

    if (dto.clientId !== undefined) {
      allowedChanges.clientId = dto.clientId;
    }
    if (dto.eventDate !== undefined) {
      allowedChanges.eventDate = dto.eventDate;
    }
    if (dto.notes !== undefined) {
      allowedChanges.notes = dto.notes;
    }
    if (dto.status !== undefined) {
      allowedChanges.status = dto.status;
    }

    this.eventBus.publish(new BookingUpdatedEvent(savedBooking.id, savedBooking.tenantId, allowedChanges, new Date()));

    if ((dto.eventDate || dto.status) && savedBooking.packageId) {
      try {
        const dateStr = savedBooking.eventDate.toISOString().split('T')[0];
        const pkgId = savedBooking.packageId as string;
        if (pkgId) {
          const pkgIdStr: string = String(pkgId);
          await this.cacheUtils.del(`availability:${savedBooking.tenantId}:${pkgIdStr}:${dateStr}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to invalidate availability cache: ${message}`);
      }
    }

    return savedBooking;
  }

  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('booking.can_only_delete_draft');
    }
    await this.bookingRepository.softRemove(booking);

    if (booking.eventDate && booking.packageId) {
      try {
        const dateStr = booking.eventDate.toISOString().split('T')[0];
        const pkgId = booking.packageId as string;
        if (pkgId) {
          const pkgIdStr: string = String(pkgId);
          await this.cacheUtils.del(`availability:${booking.tenantId}:${pkgIdStr}:${dateStr}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to invalidate availability cache: ${message}`);
      }
    }
  }

  async recordPayment(id: string, dto: RecordPaymentDto): Promise<void> {
    const booking = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      // 1. Record the financial transaction
      // Note: We need a version of createTransaction that accepts a manager
      // or we can use the manager to save directly if we want to bypass the service wrapper,
      // but better to expose a 'withManager' method in FinanceService if possible.
      // For now, let's look at FinanceService. It has createTransactionWithManager.

      // 2. Double check the booking inside transaction with lock to prevent race conditions
      const lockedBooking = await manager.findOne(Booking, {
        where: { id: booking.id, tenantId: booking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBooking) {
        throw new NotFoundException('bookings.not_found');
      }

      // 3. Record the financial transaction
      await this.financeService.createTransactionWithManager(manager, {
        type: TransactionType.INCOME,
        amount: dto.amount,
        description: `Payment for booking ${lockedBooking.client?.name || 'Client'} - ${dto.paymentMethod || 'Manual'}`,
        bookingId: lockedBooking.id,
        category: 'Booking Payment',
        transactionDate: new Date(),
      });

      // 4. Update the booking's amountPaid field atomically using the locked data
      const currentPaid = Number(lockedBooking.amountPaid || 0);
      const newPaid = MathUtils.add(currentPaid, dto.amount);

      await manager.update(
        Booking,
        { id: lockedBooking.id, tenantId: lockedBooking.tenantId },
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

  async markAsPaid(id: string, dto: MarkBookingPaidDto = {}): Promise<void> {
    const booking = await this.findOne(id);
    const total = Number(booking.totalPrice || 0);
    const paid = Number(booking.amountPaid || 0);
    const remaining = MathUtils.subtract(total, paid);

    if (remaining <= 0) {
      throw new BadRequestException('booking.already_fully_paid');
    }

    return this.recordPayment(id, {
      amount: remaining,
      paymentMethod: dto.paymentMethod,
      reference: dto.reference,
    });
  }
}
