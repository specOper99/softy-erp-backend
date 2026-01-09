import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response as ExpressResponse } from 'express';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import {
  BookingFilterDto,
  CancelBookingDto,
  CreateBookingDto,
  CreateClientDto,
  RecordPaymentDto,
  UpdateBookingDto,
  UpdateClientDto,
} from '../dto';
import { Booking } from '../entities/booking.entity';
import { Client } from '../entities/client.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { BookingUpdatedEvent } from '../events/booking-updated.event';
import { PaymentRecordedEvent } from '../events/payment-recorded.event';
import type { BookingExportRow, ClientCsvRow } from '../types/export.types';
import { BookingStateMachineService } from './booking-state-machine.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly catalogService: CatalogService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
    private readonly exportService: ExportService,
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

    // Validate tax rate bounds
    const taxRate = dto.taxRate ?? 0;
    if (taxRate < 0 || taxRate > 100) {
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
      tenantId,
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

  async exportBookingsToCSV(res: ExpressResponse): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryStream = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.client', 'client')
      .leftJoinAndSelect('booking.servicePackage', 'servicePackage')
      .where('booking.tenantId = :tenantId', { tenantId })
      .orderBy('booking.createdAt', 'DESC')
      .stream();

    try {
      const fields = [
        'id',
        'clientName',
        'clientEmail',
        'package',
        'eventDate',
        'totalPrice',
        'status',
        'createdAt',
      ];

      const transformFn = (row: unknown): BookingExportRow => {
        const typedRow = row as {
          booking_id?: string;
          client_name?: string;
          client_email?: string;
          servicePackage_name?: string;
          booking_event_date?: string;
          booking_total_price?: string;
          booking_status?: string;
          booking_created_at?: string;
        };

        return {
          id: typedRow.booking_id ?? 'unknown',
          clientName: typedRow.client_name ?? '',
          clientEmail: typedRow.client_email ?? '',
          package: typedRow.servicePackage_name ?? '',
          eventDate: typedRow.booking_event_date
            ? new Date(typedRow.booking_event_date).toISOString()
            : '',
          totalPrice: Number(typedRow.booking_total_price ?? 0),
          status: typedRow.booking_status ?? 'UNKNOWN',
          createdAt: typedRow.booking_created_at
            ? new Date(typedRow.booking_created_at).toISOString()
            : '',
        };
      };

      this.exportService.streamFromStream(
        res,
        queryStream,
        `bookings-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } finally {
      const streamWithDestroy = queryStream as unknown;
      if (
        streamWithDestroy &&
        typeof streamWithDestroy === 'object' &&
        'destroy' in streamWithDestroy
      ) {
        await (streamWithDestroy as { destroy: () => Promise<void> }).destroy();
      }
    }
  }

  async findOne(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const booking = await this.bookingRepository.findOne({
      where: { id, tenantId },
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
        throw new BadRequestException(
          `Cannot update ${disallowed.join(', ')} on non-draft booking`,
        );
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
      throw new BadRequestException('Can only delete draft bookings');
    }
    await this.bookingRepository.softRemove(booking);
  }

  async cancelBooking(id: string, dto?: CancelBookingDto): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    this.stateMachine.validateTransition(
      booking.status,
      BookingStatus.CANCELLED,
    );

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    if (dto?.reason) {
      booking.cancellationReason = dto.reason;
    }

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(booking);

      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
          oldValues: { status: oldStatus },
          newValues: { status: BookingStatus.CANCELLED },
        },
        manager,
      );

      return saved;
    });

    const daysBeforeEvent = Math.ceil(
      (booking.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    this.eventBus.publish(
      new BookingCancelledEvent(
        savedBooking.id,
        savedBooking.tenantId,
        savedBooking.client?.email || '',
        savedBooking.client?.name || '',
        savedBooking.eventDate,
        booking.cancelledAt,
        daysBeforeEvent,
        dto?.reason || '',
        Number(savedBooking.amountPaid || 0),
        Number(savedBooking.refundAmount || 0),
        0,
      ),
    );

    return savedBooking;
  }

  async recordPayment(id: string, dto: RecordPaymentDto): Promise<void> {
    const booking = await this.findOne(id);
    await this.financeService.createTransaction({
      type: TransactionType.INCOME,
      amount: dto.amount,
      description: `Payment for booking ${booking.client?.name || 'Client'} - ${dto.paymentMethod || 'Manual'}`,
      bookingId: booking.id,
      category: 'Booking Payment',
      transactionDate: new Date().toISOString(),
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
        0, // amountPaid (cumulative) - calculating this would require another query, leaving as 0 for now as it's not used in metrics handler
      ),
    );
  }

  async completeBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    this.stateMachine.validateTransition(
      booking.status,
      BookingStatus.COMPLETED,
    );

    const tasksArray = await booking.tasks;
    if (!tasksArray || tasksArray.length === 0) {
      throw new BadRequestException('No tasks found for this booking');
    }
    const pendingTasks = tasksArray.filter(
      (t) => t.status !== TaskStatus.COMPLETED,
    );
    if (pendingTasks.length > 0) {
      throw new BadRequestException(
        `Cannot complete booking: ${pendingTasks.length} tasks are still pending`,
      );
    }

    booking.status = BookingStatus.COMPLETED;

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(booking);

      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
          oldValues: { status: oldStatus },
          newValues: { status: BookingStatus.COMPLETED },
        },
        manager,
      );

      return saved;
    });

    return savedBooking;
  }

  // Client Management Methods
  async createClient(dto: CreateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = this.clientRepository.create({
      ...dto,
      tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAllClients(
    query: PaginationDto = new PaginationDto(),
    tags?: string[],
  ): Promise<Client[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryBuilder = this.clientRepository
      .createQueryBuilder('client')
      .where('client.tenantId = :tenantId', { tenantId })
      .orderBy('client.createdAt', 'DESC')
      .skip(query.getSkip())
      .take(query.getTake());

    // Filter by tags if provided (JSONB array containment)
    if (tags && tags.length > 0) {
      queryBuilder.andWhere('client.tags @> :tags', {
        tags: JSON.stringify(tags),
      });
    }

    return queryBuilder.getMany();
  }

  async findClientById(id: string): Promise<Client> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = await this.clientRepository.findOne({
      where: { id, tenantId },
    });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
    return client;
  }

  async updateClientTags(id: string, tags: string[]): Promise<Client> {
    const client = await this.findClientById(id);
    client.tags = tags;
    return this.clientRepository.save(client);
  }

  async updateClient(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findClientById(id);

    if (dto.name !== undefined) client.name = dto.name;
    if (dto.email !== undefined) client.email = dto.email;
    if (dto.phone !== undefined) client.phone = dto.phone;
    if (dto.notes !== undefined) client.notes = dto.notes;
    if (dto.tags !== undefined) client.tags = dto.tags;

    const savedClient = await this.clientRepository.save(client);

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'Client',
      entityId: client.id,
      oldValues: { name: client.name, email: client.email },
      newValues: dto as Record<string, unknown>,
    });

    return savedClient;
  }

  async deleteClient(id: string): Promise<void> {
    const client = await this.findClientById(id);

    const bookingsCount = await this.bookingRepository.count({
      where: { clientId: id, tenantId: client.tenantId },
    });

    if (bookingsCount > 0) {
      throw new BadRequestException(
        `Cannot delete client with ${bookingsCount} booking(s). Please reassign or delete bookings first.`,
      );
    }

    await this.clientRepository.softRemove(client);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'Client',
      entityId: id,
      oldValues: { name: client.name, email: client.email },
      newValues: {},
    });
  }

  async duplicateBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const newBooking = this.bookingRepository.create({
      clientId: booking.clientId,
      eventDate: booking.eventDate,
      packageId: booking.packageId,
      notes: booking.notes ? `[Copy] ${booking.notes}` : '[Copy]',
      totalPrice: booking.totalPrice,
      status: BookingStatus.DRAFT,
      tenantId,
    });

    const savedBooking = await this.bookingRepository.save(newBooking);

    await this.auditService.log({
      action: 'DUPLICATE',
      entityName: 'Booking',
      entityId: savedBooking.id,
      oldValues: { originalBookingId: id },
      newValues: { newBookingId: savedBooking.id },
    });

    this.dashboardGateway.broadcastMetricsUpdate(tenantId, 'BOOKING', {
      action: 'DUPLICATED',
      originalBookingId: id,
      newBookingId: savedBooking.id,
    });

    return savedBooking;
  }

  async exportClientsToCSV(res: ExpressResponse): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryStream = await this.clientRepository
      .createQueryBuilder('client')
      .leftJoin('client.bookings', 'booking')
      .where('client.tenantId = :tenantId', { tenantId })
      .select([
        'client.id',
        'client.name',
        'client.email',
        'client.phone',
        'client.notes',
        'client.createdAt',
      ])
      .addSelect('COUNT(booking.id)', 'bookingCount')
      .groupBy('client.id')
      .orderBy('client.createdAt', 'DESC')
      .stream();

    try {
      const fields = [
        'id',
        'name',
        'email',
        'phone',
        'notes',
        'bookingCount',
        'createdAt',
      ];

      const transformFn = (row: unknown): ClientCsvRow => {
        const typedRow = row as {
          client_id?: string;
          client_name?: string;
          client_email?: string;
          client_phone?: string;
          client_notes?: string;
          client_createdAt?: string;
          bookingCount?: string | number;
        };

        return {
          id: typedRow.client_id ?? 'unknown',
          name: typedRow.client_name ?? '',
          email: typedRow.client_email ?? '',
          phone: typedRow.client_phone ?? '',
          notes: typedRow.client_notes ?? '',
          bookingCount: Number(typedRow.bookingCount ?? 0),
          createdAt: typedRow.client_createdAt
            ? new Date(typedRow.client_createdAt)
            : new Date(),
        };
      };

      this.exportService.streamFromStream(
        res,
        queryStream,
        `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } finally {
      const streamWithDestroy = queryStream as unknown;
      if (
        streamWithDestroy &&
        typeof streamWithDestroy === 'object' &&
        'destroy' in streamWithDestroy
      ) {
        await (streamWithDestroy as { destroy: () => Promise<void> }).destroy();
      }
    }
  }
}
