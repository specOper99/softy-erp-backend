import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BookingStatus, TaskStatus, TransactionType } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceService } from '../finance/services/finance.service';
import { Task } from '../tasks/entities/task.entity';
import {
  ConfirmBookingResponseDto,
  CreateBookingDto,
  CreateClientDto,
  UpdateBookingDto,
} from './dto';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';
import { BookingConfirmedEvent } from './events/booking-confirmed.event';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(ServicePackage)
    private readonly packageRepository: Repository<ServicePackage>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantId();
    // Validate package exists and get price
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId, tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(
        `ServicePackage with ID ${dto.packageId} not found`,
      );
    }

    const booking = this.bookingRepository.create({
      clientId: dto.clientId,
      eventDate: new Date(dto.eventDate),
      packageId: dto.packageId,
      notes: dto.notes,
      totalPrice: pkg.price,
      status: BookingStatus.DRAFT,
      tenantId,
    });

    return this.bookingRepository.save(booking);
  }

  async findAll(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.bookingRepository.find({
      where: { tenantId },
      relations: ['servicePackage', 'client'],
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findOne(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantId();
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

    if (booking.status !== BookingStatus.DRAFT && dto.status === undefined) {
      throw new BadRequestException('Cannot update a non-draft booking');
    }

    if (dto.eventDate) {
      booking.eventDate = new Date(dto.eventDate);
    }

    Object.assign(booking, {
      ...dto,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : booking.eventDate,
    });

    return this.bookingRepository.save(booking);
  }

  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('Can only delete draft bookings');
    }
    await this.bookingRepository.softRemove(booking);
  }

  /**
   * WORKFLOW 1: Booking Confirmation
   * Transactional steps:
   * 1. Acquire pessimistic lock on booking
   * 2. Update booking status to CONFIRMED
   * 3. Generate Tasks from ServicePackage items (bulk insert)
   * 4. Create INCOME transaction in Finance
   * 5. Rollback all on failure
   */
  async confirmBooking(id: string): Promise<ConfirmBookingResponseDto> {
    const tenantId = TenantContextService.getTenantId();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      // Step 1: Acquire pessimistic lock to prevent race conditions
      // Note: We MUST NOT include relations here because "FOR UPDATE" cannot be
      // applied to the nullable side of an outer join (which TypeORM uses for relations)
      const bookingLock = await queryRunner.manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bookingLock) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Step 2: Fetch actual data with relations.
      // We use the same queryRunner.manager which holds the lock from Step 1.
      // We explicitly re-apply the lock to ensure the relation fetch is also protected
      // if the database/ORM supports it, or at least to document the intent.
      const booking = await queryRunner.manager.findOne(Booking, {
        where: { id, tenantId },
        relations: [
          'client',
          'servicePackage',
          'servicePackage.packageItems',
          'servicePackage.packageItems.taskType',
        ],
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      if (booking.status !== BookingStatus.DRAFT) {
        throw new BadRequestException(
          `Booking is already ${booking.status}. Only DRAFT bookings can be confirmed.`,
        );
      }

      // Step 2: Update booking status to CONFIRMED
      booking.status = BookingStatus.CONFIRMED;
      await queryRunner.manager.save(booking);

      // Step 3: Generate Tasks from package items (bulk insert for performance)
      const packageItems = await (booking.servicePackage?.packageItems ??
        Promise.resolve([]));
      const tasksToCreate: Partial<Task>[] = [];
      const maxTasks = this.configService.get<number>(
        'booking.maxTasksPerBooking',
        500,
      );

      // Calculate total tasks to be created
      const totalTasksCount = packageItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0,
      );

      if (totalTasksCount > maxTasks) {
        throw new BadRequestException(
          `Cannot confirm booking: total tasks requested (${totalTasksCount}) exceeds the maximum allowed limit of ${maxTasks} per booking.`,
        );
      }

      for (const item of packageItems) {
        for (let i = 0; i < item.quantity; i++) {
          tasksToCreate.push({
            bookingId: booking.id,
            taskTypeId: item.taskTypeId,
            status: TaskStatus.PENDING,
            commissionSnapshot:
              (item as { taskType?: { defaultCommissionAmount?: number } })
                .taskType?.defaultCommissionAmount ?? 0,
            dueDate: booking.eventDate,
            tenantId: booking.tenantId,
          });
        }
      }

      const createdTasks = await queryRunner.manager.save(Task, tasksToCreate);

      // Step 3: Create INCOME transaction
      const transaction =
        await this.financeService.createTransactionWithManager(
          queryRunner.manager,
          {
            type: TransactionType.INCOME,
            amount: Number(booking.totalPrice),
            category: 'Booking Payment',
            bookingId: booking.id,
            description: `Booking confirmed: ${booking.client?.name || 'Unknown Client'} - ${booking.servicePackage?.name}`,
            transactionDate: new Date(),
          },
        );

      // Step 4: Audit Log
      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
          oldValues: { status: BookingStatus.DRAFT },
          newValues: { status: BookingStatus.CONFIRMED },
          notes: 'Booking confirmed, tasks generated and payment recorded.',
        },
        queryRunner.manager,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit domain event for side effects (webhooks, emails, etc.)
      this.eventBus.publish(
        new BookingConfirmedEvent(
          booking.id,
          booking.tenantId,
          booking.client?.email || '',
          booking.client?.name || 'Client',
          booking.servicePackage?.name || 'Service Package',
          Number(booking.totalPrice),
          booking.eventDate,
        ),
      );

      return {
        booking,
        tasksCreated: createdTasks.length,
        transactionId: transaction.id,
      };
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    booking.status = BookingStatus.CANCELLED;
    const savedBooking = await this.bookingRepository.save(booking);

    await this.auditService.log({
      action: 'STATUS_CHANGE',
      entityName: 'Booking',
      entityId: booking.id,
      oldValues: { status: oldStatus },
      newValues: { status: BookingStatus.CANCELLED },
    });

    return savedBooking;
  }

  async completeBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }

    // Check if all tasks are completed
    const tasksArray = await booking.tasks;
    if (!tasksArray) {
      throw new BadRequestException('No tasks found for this booking');
    }
    const pendingTasks = tasksArray.filter(
      (t) => t.status !== TaskStatus.COMPLETED,
    );
    if (pendingTasks && pendingTasks.length > 0) {
      throw new BadRequestException(
        `Cannot complete booking: ${pendingTasks.length} tasks are still pending`,
      );
    }

    booking.status = BookingStatus.COMPLETED;
    const savedBooking = await this.bookingRepository.save(booking);

    await this.auditService.log({
      action: 'STATUS_CHANGE',
      entityName: 'Booking',
      entityId: booking.id,
      oldValues: { status: oldStatus },
      newValues: { status: BookingStatus.COMPLETED },
    });

    return savedBooking;
  }

  // Client Management Methods
  async createClient(dto: CreateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantId();
    const client = this.clientRepository.create({
      ...dto,
      tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAllClients(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Client[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.clientRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findClientById(id: string): Promise<Client> {
    const tenantId = TenantContextService.getTenantId();
    const client = await this.clientRepository.findOne({
      where: { id, tenantId },
    });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
    return client;
  }
}
