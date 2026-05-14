import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Counter } from 'prom-client';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
import { BookingsPricingService } from './bookings-pricing.service';

import { FlagsService } from '../../../common/flags/flags.service';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { CatalogService } from '../../catalog/services/catalog.service';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { Task } from '../../tasks/entities/task.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../users/enums/role.enum';
import {
  BookingAvailabilityConflictCode,
  BookingAvailabilityQueryDto,
  BookingAvailabilityResponseDto,
  BookingCursorFilterDto,
  BookingFilterDto,
  BookingSortBy,
  CreateBookingDto,
  SortOrder,
  UpdateBookingDto,
} from '../dto';
import { Booking } from '../entities/booking.entity';
import { ProcessingType } from '../entities/processing-type.entity';

import { BookingStatus } from '../enums/booking-status.enum';

import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { AuditService } from '../../audit/audit.service';
import { BookingRepository } from '../repositories/booking.repository';
import { ProcessingTypeRepository } from '../repositories/processing-type.repository';
import { parseCanonicalBookingDateInput } from '../utils/booking-date-policy.util';
import { StaffConflictService } from './staff-conflict.service';

/** Shared filter fields used by both offset and cursor pagination. */
interface BookingFilterFields {
  search?: string;
  status?: BookingStatus[];
  startDate?: string;
  endDate?: string;
  packageId?: string;
  clientId?: string;
  minPrice?: number;
  maxPrice?: number;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly lifecycleStatusRejectedCounter: Counter<'tenantId' | 'enforced'>;

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly catalogService: CatalogService,
    private readonly dataSource: DataSource,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
    private readonly staffConflictService: StaffConflictService,
    private readonly flagsService: FlagsService,
    metricsFactory: MetricsFactory,
    private readonly processingTypeRepository: ProcessingTypeRepository,
    private readonly auditService: AuditService,
    private readonly pricingService: BookingsPricingService,
  ) {
    this.lifecycleStatusRejectedCounter = metricsFactory.getOrCreateCounter({
      name: 'booking_lifecycle_status_update_rejected_total',
      help: 'Total generic booking update status transition attempts rejected',
      labelNames: ['tenantId', 'enforced'],
    });
  }

  private async invalidateAvailability(booking: Booking): Promise<void> {
    if (!booking.eventDate || !booking.packageId) return;
    try {
      const dateStr = booking.eventDate.toISOString().split('T')[0] ?? '';
      await this.availabilityCacheOwner.delAvailability(booking.tenantId, booking.packageId, dateStr);
    } catch (err) {
      const message = toErrorMessage(err);
      this.logger.warn(`Failed to invalidate availability cache: ${message}`);
    }
  }

  private validateProcessingTypeSelection(
    requestedIds: string[],
    processingTypes: ProcessingType[],
    packageId: string,
  ): ProcessingType[] {
    const uniqueIds = Array.from(new Set(requestedIds));
    const validTypes = processingTypes.filter((pt) => pt.packageId === packageId);
    const validIds = new Set(validTypes.map((pt) => pt.id));
    const allRequestedTypesMatchPackage = uniqueIds.every((id) => validIds.has(id));

    if (validTypes.length !== uniqueIds.length || !allRequestedTypesMatchPackage) {
      throw new BadRequestException('booking.processing_type_package_mismatch');
    }

    return validTypes;
  }

  private async findPackageProcessingTypes(
    ids: string[] | undefined,
    tenantId: string,
    packageId: string,
  ): Promise<ProcessingType[]> {
    const uniqueIds = Array.from(new Set(ids ?? []));
    if (uniqueIds.length === 0) return [];

    const processingTypes = await this.processingTypeRepository.find({
      where: { id: In(uniqueIds), tenantId },
    });

    return this.validateProcessingTypeSelection(uniqueIds, processingTypes, packageId);
  }

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    // Validate package exists and get price
    const pkg = await this.catalogService.findPackageById(dto.packageId);

    // Validate event date is at least 1 hour in the future
    const eventDate = parseCanonicalBookingDateInput(dto.eventDate);
    const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
    if (eventDate < oneHourFromNow) {
      throw new BadRequestException('booking.event_date_must_be_future');
    }

    const priceInput = {
      packagePrice: Number(pkg.price),
      taxRate: dto.taxRate ?? 0,
      depositPercentage: dto.depositPercentage ?? 0,
      discountAmount: dto.discountAmount ?? 0,
    };

    // Add selected processing type prices to the package base price
    const selectedProcessingTypes = await this.findPackageProcessingTypes(
      dto.processingTypeIds,
      tenantId,
      dto.packageId,
    );
    if (dto.processingTypeIds && dto.processingTypeIds.length > 0) {
      const processingTypeTotal = selectedProcessingTypes.reduce((sum, pt) => sum + Number(pt.price), 0);
      priceInput.packagePrice += processingTypeTotal;
    }

    this.pricingService.validate(priceInput.taxRate, priceInput.depositPercentage);
    const pricing = this.pricingService.calculate(priceInput);

    if (dto.startTime && pkg.durationMinutes > 0 && !dto.skipAvailabilityCheck) {
      await this.ensureNoStaffConflict({
        packageId: dto.packageId,
        eventDate,
        startTime: dto.startTime,
        durationMinutes: pkg.durationMinutes,
      });
    }

    const booking = this.bookingRepository.create({
      clientId: dto.clientId,
      eventDate,
      packageId: dto.packageId,
      notes: dto.notes,
      handoverType: dto.handoverType ?? null,
      startTime: dto.startTime ?? null,
      durationMinutes: pkg.durationMinutes,
      subTotal: pricing.subTotal,
      discountAmount: pricing.discountAmount,
      taxRate: pricing.taxRate,
      taxAmount: pricing.taxAmount,
      totalPrice: pricing.totalPrice,
      status: BookingStatus.DRAFT,
      depositPercentage: pricing.depositPercentage,
      depositAmount: pricing.depositAmount,
      amountPaid: 0,
      refundAmount: 0,
      venueCost: dto.venueCost ?? 0,
      paymentStatus: PaymentStatus.UNPAID,
      locationLink: dto.locationLink ?? null,
    });

    const savedBooking = await this.bookingRepository.save(booking);

    // Attach processing types via join table if provided
    if (dto.processingTypeIds && dto.processingTypeIds.length > 0) {
      savedBooking.processingTypes = selectedProcessingTypes;
      await this.bookingRepository.save(savedBooking);
    } else {
      savedBooking.processingTypes = [];
    }

    // Enqueue domain event via transactional outbox for reliable cross-module delivery
    await this.outboxRepository.save({
      aggregateId: savedBooking.id,
      type: 'BookingCreatedEvent',
      payload: {
        bookingId: savedBooking.id,
        tenantId,
        clientId: savedBooking.clientId,
        clientEmail: '',
        clientName: '',
        packageId: savedBooking.packageId,
        packageName: pkg.name,
        totalPrice: savedBooking.totalPrice,
        assignedUserId: null,
        eventDate: savedBooking.eventDate,
        createdAt: savedBooking.createdAt,
      },
    });

    await this.invalidateAvailability(savedBooking);

    return savedBooking;
  }

  async findAll(query: BookingFilterDto = new BookingFilterDto(), user?: User): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect('booking.processingTypes', 'processingTypes')
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

    this.applyBookingFilters(qb, query);

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      this.applyFieldStaffFilter(qb, user.id);
    }

    return qb.getMany();
  }

  async findAllCursor(
    query: BookingCursorFilterDto,
    user?: User,
  ): Promise<{ data: Booking[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.bookingRepository.createQueryBuilder('booking');

    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect('booking.processingTypes', 'processingTypes')
      .where('booking.tenantId = :tenantId', { tenantId });

    this.applyBookingFilters(qb, query);

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      this.applyFieldStaffFilter(qb, user.id);
    }

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit: query.limit,
      alias: 'booking',
    });
  }

  async findOne(id: string, user?: User): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.bookingRepository.createQueryBuilder('booking');
    qb.andWhere('booking.id = :id AND booking.tenantId = :tenantId', { id, tenantId });

    // Apply standard relations
    qb.leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .leftJoinAndSelect('booking.processingTypes', 'processingTypes')
      .leftJoinAndSelect(Task, 'tasks', 'tasks.bookingId = booking.id AND tasks.tenantId = booking.tenantId')
      .leftJoinAndSelect('tasks.assignedUser', 'assignedUser')
      .leftJoinAndSelect('tasks.processingType', 'taskProcessingType');

    // RBAC: FIELD_STAFF can only see bookings they are assigned to via tasks
    if (user && user.role === Role.FIELD_STAFF) {
      this.applyFieldStaffFilter(qb, user.id);
    }

    const booking = await qb.getOne();
    if (!booking) {
      throw new NotFoundException({
        code: 'bookings.not_found_by_id',
        args: { id },
      });
    }
    return booking;
  }

  async update(id: string, inputDto: UpdateBookingDto, user: User): Promise<Booking> {
    const dto = { ...inputDto };
    const tenantId = TenantContextService.getTenantIdOrThrow();

    if (dto.status !== undefined) {
      const enforceStrictLifecycle = this.flagsService.isEnabled(
        'strictBookingLifecycle',
        { tenantId, bookingId: id, requestedStatus: dto.status },
        true,
      );

      this.lifecycleStatusRejectedCounter.inc({ tenantId, enforced: enforceStrictLifecycle ? 'true' : 'false' });

      if (enforceStrictLifecycle) {
        throw new BadRequestException('booking.lifecycle_status_requires_workflow');
      }

      delete dto.status;
    }

    // Initial fetch for validation (outside transaction)
    const existingBooking = await this.findOne(id, user);

    // SECURITY: Only allow limited updates on non-draft bookings
    if (existingBooking.status !== BookingStatus.DRAFT) {
      const allowedUpdates = ['notes', 'handoverType', 'processingTypeIds'];
      const attemptedUpdates = Object.keys(dto).filter((k) => dto[k as keyof UpdateBookingDto] !== undefined);
      const disallowed = attemptedUpdates.filter((k) => !allowedUpdates.includes(k));
      if (disallowed.length > 0) {
        throw new BadRequestException('booking.cannot_update_non_draft');
      }
    }

    const nextStatus = existingBooking.status;
    const nextStartTime = dto.startTime ?? existingBooking.startTime;
    if (nextStatus !== BookingStatus.DRAFT && !nextStartTime) {
      throw new BadRequestException('booking.start_time_required_for_non_draft');
    }

    if (dto.eventDate) {
      const eventDate = parseCanonicalBookingDateInput(dto.eventDate);
      const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
      if (eventDate < oneHourFromNow) {
        throw new BadRequestException('booking.event_date_must_be_future');
      }
    }

    const { savedBooking, previousPricing } = await this.dataSource.transaction(async (manager) => {
      // Re-fetch with pessimistic lock inside transaction to prevent lost updates
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId: existingBooking.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('bookings.not_found');
      }

      const originalPricing = {
        subTotal: Number(booking.subTotal || 0),
        taxAmount: Number(booking.taxAmount || 0),
        totalPrice: Number(booking.totalPrice || 0),
      };

      if (dto.eventDate) {
        booking.eventDate = parseCanonicalBookingDateInput(dto.eventDate);
      }

      // Gap 3: Recalculate pricing when draft-only fields change
      const hasPriceFieldChange =
        dto.packageId !== undefined ||
        dto.taxRate !== undefined ||
        dto.depositPercentage !== undefined ||
        dto.discountAmount !== undefined;

      if (booking.status === BookingStatus.DRAFT && hasPriceFieldChange) {
        const pkgId = dto.packageId ?? booking.packageId;
        const pkg = await this.catalogService.findPackageById(pkgId);

        // Determine processing type total (use updated IDs if changing, else load current)
        let processingTypeTotal = 0;
        const ptIds = dto.processingTypeIds !== undefined ? dto.processingTypeIds : undefined;
        if (ptIds !== undefined) {
          if (ptIds.length > 0) {
            const pts = await manager.find(ProcessingType, {
              where: { id: In(Array.from(new Set(ptIds))), tenantId: existingBooking.tenantId },
            });
            const selectedTypes = this.validateProcessingTypeSelection(ptIds, pts, pkgId);
            processingTypeTotal = selectedTypes.reduce((sum, pt) => sum + Number(pt.price), 0);
          }
        } else {
          // Load existing processing types for price recalculation
          const existingWithPT = await manager.findOne(Booking, {
            where: { id: existingBooking.id, tenantId: existingBooking.tenantId },
            relations: ['processingTypes'],
          });
          processingTypeTotal = (existingWithPT?.processingTypes ?? []).reduce((sum, pt) => sum + Number(pt.price), 0);
        }

        const pricing = this.pricingService.calculate({
          packagePrice: Number(pkg.price) + processingTypeTotal,
          taxRate: dto.taxRate ?? Number(booking.taxRate),
          depositPercentage: dto.depositPercentage ?? Number(booking.depositPercentage),
          discountAmount: dto.discountAmount ?? Number(booking.discountAmount ?? 0),
        });

        booking.packageId = pkgId;
        booking.durationMinutes = pkg.durationMinutes;
        booking.subTotal = pricing.subTotal;
        booking.discountAmount = pricing.discountAmount;
        booking.taxRate = pricing.taxRate;
        booking.taxAmount = pricing.taxAmount;
        booking.totalPrice = pricing.totalPrice;
        booking.depositPercentage = pricing.depositPercentage;
        booking.depositAmount = pricing.depositAmount;
        // Update payment status after recalculation since totals changed
        booking.paymentStatus = booking.derivePaymentStatus();
      }

      // Apply remaining simple field updates (excluding price fields already handled)
      if (dto.clientId !== undefined) booking.clientId = dto.clientId;
      if (dto.eventDate !== undefined) booking.eventDate = parseCanonicalBookingDateInput(dto.eventDate);
      if (dto.startTime !== undefined) booking.startTime = dto.startTime;
      if (dto.notes !== undefined) booking.notes = dto.notes;
      if (dto.handoverType !== undefined) booking.handoverType = dto.handoverType;
      if (dto.locationLink !== undefined) booking.locationLink = dto.locationLink;
      if (dto.venueCost !== undefined) booking.venueCost = dto.venueCost;

      // Update processing types if provided
      if (dto.processingTypeIds !== undefined) {
        if (dto.processingTypeIds.length > 0) {
          const types = await manager.find(ProcessingType, {
            where: { id: In(Array.from(new Set(dto.processingTypeIds))), tenantId: existingBooking.tenantId },
          });
          booking.processingTypes = this.validateProcessingTypeSelection(
            dto.processingTypeIds,
            types,
            dto.packageId ?? booking.packageId,
          );
        } else {
          booking.processingTypes = [];
        }
      }

      const saved = await manager.save(booking);

      return { savedBooking: saved, previousPricing: originalPricing };
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
    if (dto.handoverType !== undefined) {
      allowedChanges.handoverType = dto.handoverType;
    }
    if (dto.processingTypeIds !== undefined) {
      allowedChanges.processingTypeIds = dto.processingTypeIds;
    }
    if (dto.startTime !== undefined) {
      allowedChanges.startTime = dto.startTime;
    }
    await this.outboxRepository.save({
      aggregateId: savedBooking.id,
      type: 'BookingUpdatedEvent',
      payload: {
        bookingId: savedBooking.id,
        tenantId: savedBooking.tenantId,
        changes: allowedChanges,
        updatedAt: new Date(),
      },
    });

    const oldSubTotal = previousPricing.subTotal;
    const oldTaxAmount = previousPricing.taxAmount;
    const oldTotalPrice = previousPricing.totalPrice;
    const newSubTotal = Number(savedBooking.subTotal || 0);
    const newTaxAmount = Number(savedBooking.taxAmount || 0);
    const newTotalPrice = Number(savedBooking.totalPrice || 0);

    if (oldSubTotal !== newSubTotal || oldTaxAmount !== newTaxAmount || oldTotalPrice !== newTotalPrice) {
      await this.outboxRepository.save({
        aggregateId: savedBooking.id,
        type: 'BookingPriceChangedEvent',
        payload: {
          bookingId: savedBooking.id,
          tenantId: savedBooking.tenantId,
          oldSubTotal,
          newSubTotal,
          oldTaxAmount,
          newTaxAmount,
          oldTotalPrice,
          newTotalPrice,
        },
      });
    }

    if (dto.eventDate || dto.startTime) {
      await this.invalidateAvailability(savedBooking);
    }

    return savedBooking;
  }

  async remove(id: string, reason: string | undefined, user: User): Promise<void> {
    const booking = await this.findOne(id, user);

    // SRS rule: block deletion only when tasks have started (IN_PROGRESS or COMPLETED)
    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('booking.cannot_delete_terminal');
    }

    if (booking.status === BookingStatus.CONFIRMED) {
      const tenantId = TenantContextService.getTenantIdOrThrow();
      const startedTasks = await this.dataSource.manager.count(Task, {
        where: [
          { bookingId: id, tenantId, status: TaskStatus.IN_PROGRESS },
          { bookingId: id, tenantId, status: TaskStatus.COMPLETED },
        ],
      });
      if (startedTasks > 0) {
        throw new BadRequestException('booking.cannot_delete_tasks_started');
      }
    }

    await this.bookingRepository.softRemove(booking);
    await this.auditService.log({
      action: 'booking.delete',
      entityName: 'Booking',
      entityId: id,
      userId: user.id,
      notes: reason,
    });

    await this.invalidateAvailability(booking);
  }

  async checkAvailability(query: BookingAvailabilityQueryDto): Promise<BookingAvailabilityResponseDto> {
    const staffAvailability = await this.staffConflictService.checkPackageStaffAvailability({
      packageId: query.packageId,
      eventDate: new Date(query.eventDate),
      startTime: query.startTime,
      durationMinutes: query.durationMinutes,
      excludeBookingId: query.excludeBookingId,
    });

    if (staffAvailability.ok) {
      return {
        available: true,
        conflictReasons: [],
      };
    }

    return {
      available: false,
      conflictReasons: [
        {
          code: BookingAvailabilityConflictCode.StaffConflict,
          message: 'Requested window has staff assignment conflict',
          details: {
            requiredStaffCount: staffAvailability.requiredStaffCount,
            eligibleCount: staffAvailability.eligibleCount,
            busyCount: staffAvailability.busyCount,
            availableCount: staffAvailability.availableCount,
          },
        },
      ],
    };
  }

  /**
   * Apply shared booking filter conditions to a query builder.
   * Used by findAll (offset), findAllCursor, and export methods.
   */
  /**
   * Applies an RBAC filter so FIELD_STAFF can only see bookings where they are
   * explicitly assigned — either via the task_assignees join table or via the
   * legacy assigned_user_id column.
   */
  private applyFieldStaffFilter(qb: SelectQueryBuilder<Booking>, userId: string): void {
    qb.andWhere(
      `(EXISTS (
        SELECT 1
        FROM tasks t
        INNER JOIN task_assignees ta
          ON ta.task_id = t.id
          AND ta.tenant_id = t.tenant_id
        WHERE t.booking_id = booking.id
          AND t.tenant_id = booking."tenant_id"
          AND ta.user_id = :userId
      ) OR EXISTS (
        SELECT 1
        FROM tasks t
        WHERE t.booking_id = booking.id
          AND t.tenant_id = booking."tenant_id"
          AND t.assigned_user_id = :userId
      ))`,
      { userId },
    );
  }

  private applyBookingFilters(qb: SelectQueryBuilder<Booking>, filters: BookingFilterFields): void {
    if (filters.search) {
      const trimmed = filters.search.trim();
      applyIlikeSearch(qb, ['client.name', 'client.email', 'booking.notes'], trimmed, {
        minLength: BUSINESS_CONSTANTS.SEARCH.MIN_LENGTH,
        maxLength: BUSINESS_CONSTANTS.SEARCH.MAX_LENGTH,
      });
    }

    if (filters.status && filters.status.length > 0) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      qb.andWhere('booking.status IN (:...statuses)', { statuses });
    }

    if (filters.startDate) {
      qb.andWhere('booking.eventDate >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      qb.andWhere('booking.eventDate <= :endDate', { endDate: filters.endDate });
    }

    if (filters.packageId) {
      qb.andWhere('booking.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters.clientId) {
      qb.andWhere('booking.clientId = :clientId', { clientId: filters.clientId });
    }

    if (filters.minPrice !== undefined) {
      qb.andWhere('booking.totalPrice >= :minPrice', { minPrice: filters.minPrice });
    }

    if (filters.maxPrice !== undefined) {
      qb.andWhere('booking.totalPrice <= :maxPrice', { maxPrice: filters.maxPrice });
    }
  }

  private async ensureNoStaffConflict(input: {
    packageId: string;
    eventDate: Date;
    startTime: string;
    durationMinutes: number;
  }): Promise<void> {
    const availability = await this.staffConflictService.checkPackageStaffAvailability(input);

    if (availability.ok) {
      return;
    }

    throw new ConflictException({
      code: 'BOOKING_STAFF_CONFLICT',
      message: 'booking.staff_conflict تعارض',
      details: {
        requiredStaffCount: availability.requiredStaffCount,
        eligibleCount: availability.eligibleCount,
        busyCount: availability.busyCount,
        availableCount: availability.availableCount,
      },
    });
  }
}
