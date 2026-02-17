import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { Task } from '../../tasks/entities/task.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { CancelBookingDto, ConfirmBookingResponseDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { BookingCompletedEvent } from '../events/booking-completed.event';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingStateMachineService } from './booking-state-machine.service';

@Injectable()
export class BookingWorkflowService {
  constructor(
    private readonly financeService: FinanceService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
    private readonly stateMachine: BookingStateMachineService,
  ) {}

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
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingConfirmedEvent | null = null;

    const result = await this.dataSource.transaction(async (manager) => {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      const bookingLock = await manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bookingLock) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Step 2: Fetch actual data with relations.
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client', 'servicePackage'],
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      this.stateMachine.validateTransition(booking.status, BookingStatus.CONFIRMED);

      booking.status = BookingStatus.CONFIRMED;
      await manager.save(booking);

      // Step 3: Generate Tasks from package items (bulk insert for performance)
      const packageItems = await manager.find(PackageItem, {
        where: { packageId: booking.packageId, tenantId },
        relations: ['taskType'],
      });
      const tasksToCreate: Partial<Task>[] = [];
      const maxTasks = this.configService.get<number>('booking.maxTasksPerBooking', 500);

      // Calculate total tasks to be created
      const totalTasksCount = packageItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

      if (totalTasksCount > maxTasks) {
        throw new BadRequestException(
          `Cannot confirm booking: total tasks requested(${totalTasksCount}) exceeds the maximum allowed limit of ${maxTasks} per booking.`,
        );
      }

      for (const item of packageItems) {
        for (let i = 0; i < item.quantity; i++) {
          tasksToCreate.push({
            bookingId: booking.id,
            taskTypeId: item.taskTypeId,
            status: TaskStatus.PENDING,
            commissionSnapshot:
              (item as { taskType?: { defaultCommissionAmount?: number } }).taskType?.defaultCommissionAmount ?? 0,
            dueDate: booking.eventDate,
            tenantId: booking.tenantId,
          });
        }
      }

      const createdTasks = await manager.save(Task, tasksToCreate);

      // Step 3: Create INCOME transaction
      const transaction = await this.financeService.createTransactionWithManager(manager, {
        type: TransactionType.INCOME,
        amount: Number(booking.totalPrice),
        category: 'Booking Payment',
        bookingId: booking.id,
        description: `Booking confirmed: ${booking.client?.name || 'Unknown Client'} - ${booking.servicePackage?.name} `,
        transactionDate: new Date(),
      });

      // Step 4: Audit Log
      await this.auditService.log({
        action: 'STATUS_CHANGE',
        entityName: 'Booking',
        entityId: booking.id,
        oldValues: { status: BookingStatus.DRAFT },
        newValues: { status: BookingStatus.CONFIRMED },
        notes: 'Booking confirmed, tasks generated and payment recorded.',
      });

      eventToPublish = new BookingConfirmedEvent(
        booking.id,
        booking.tenantId,
        booking.client?.email || '',
        booking.client?.name || 'Client',
        booking.servicePackage?.name || 'Service Package',
        Number(booking.totalPrice),
        booking.eventDate,
      );

      return {
        booking,
        tasksCreated: createdTasks.length,
        transactionId: transaction.id,
      };
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    return result;
  }
  /**
   * WORKFLOW 2: Booking Cancellation
   * Transactional steps:
   * 1. Validate transition
   * 2. Update status and cancellation details
   * 3. Audit log
   * 4. Publish BookingCancelledEvent
   */
  async cancelBooking(id: string, dto?: CancelBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingCancelledEvent | null = null;

    // Use a transaction for consistency
    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client'],
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const oldStatus = booking.status;

      this.stateMachine.validateTransition(booking.status, BookingStatus.CANCELLED);

      booking.status = BookingStatus.CANCELLED;
      booking.cancelledAt = new Date();
      if (dto?.reason) {
        booking.cancellationReason = dto.reason;
      }

      const saved = await manager.save(booking);

      await this.auditService.log({
        action: 'STATUS_CHANGE',
        entityName: 'Booking',
        entityId: booking.id,
        oldValues: { status: oldStatus },
        newValues: { status: BookingStatus.CANCELLED },
      });

      const daysBeforeEvent = Math.ceil((booking.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      eventToPublish = new BookingCancelledEvent(
        saved.id,
        saved.tenantId,
        saved.client?.email || '',
        saved.client?.name || '',
        saved.eventDate,
        booking.cancelledAt,
        daysBeforeEvent,
        dto?.reason || '',
        Number(saved.amountPaid || 0),
        Number(saved.refundAmount || 0),
        0,
      );

      return saved;
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    return savedBooking;
  }

  /**
   * WORKFLOW 3: Booking Completion
   * Transactional steps:
   * 1. Validate transition
   * 2. Check pending tasks
   * 3. Update status
   * 4. Audit log
   */
  async completeBooking(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingCompletedEvent | null = null;

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const oldStatus = booking.status;

      this.stateMachine.validateTransition(booking.status, BookingStatus.COMPLETED);

      const tasksArray = await manager.find(Task, {
        where: { bookingId: booking.id, tenantId },
      });
      if (!tasksArray || tasksArray.length === 0) {
        // Warning: This logic assumes a complete booking SHOULD have tasks.
        throw new BadRequestException('No tasks found for this booking');
      }
      const pendingTasks = tasksArray.filter((t) => t.status !== TaskStatus.COMPLETED);
      if (pendingTasks.length > 0) {
        throw new BadRequestException(`Cannot complete booking: ${pendingTasks.length} tasks are still pending`);
      }

      booking.status = BookingStatus.COMPLETED;

      const savedBooking = await manager.save(booking);

      await this.auditService.log({
        action: 'STATUS_CHANGE',
        entityName: 'Booking',
        entityId: booking.id,
        oldValues: { status: oldStatus },
        newValues: { status: BookingStatus.COMPLETED },
      });

      eventToPublish = new BookingCompletedEvent(savedBooking.id, savedBooking.tenantId, new Date());

      return savedBooking;
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    return savedBooking;
  }

  async duplicateBooking(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // We can use the simple repo find since create() doesn't need transaction yet
    // But duplicate usually implies read -> create.
    const booking = await this.dataSource.manager.findOne(Booking, {
      where: { id, tenantId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    const newBooking = this.dataSource.manager.create(Booking, {
      clientId: booking.clientId,
      eventDate: booking.eventDate,
      packageId: booking.packageId,
      notes: booking.notes ? `[Copy] ${booking.notes} ` : '[Copy]',
      totalPrice: booking.totalPrice,
      subTotal: booking.subTotal,
      taxRate: booking.taxRate,
      taxAmount: booking.taxAmount,
      depositPercentage: booking.depositPercentage,
      depositAmount: booking.depositAmount,
      amountPaid: 0,
      refundAmount: 0,
      status: BookingStatus.DRAFT,
      tenantId,
    });

    const savedBooking = await this.dataSource.manager.save(Booking, newBooking);

    await this.auditService.log({
      action: 'DUPLICATE',
      entityName: 'Booking',
      entityId: savedBooking.id,
      oldValues: { originalBookingId: id },
      newValues: { newBookingId: savedBooking.id },
    });

    this.eventBus.publish(
      new BookingCreatedEvent(
        savedBooking.id,
        tenantId,
        savedBooking.clientId,
        '',
        '',
        savedBooking.packageId,
        '',
        Number(savedBooking.totalPrice),
        null,
        savedBooking.eventDate,
        savedBooking.createdAt,
      ),
    );

    return savedBooking;
  }
}
