import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { Transaction } from '../../finance/entities/transaction.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { PackageItem } from '../../catalog/entities/package-item.entity';
import { TaskAssignee } from '../../tasks/entities/task-assignee.entity';
import { Task } from '../../tasks/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/entities/time-entry.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { User } from '../../users/entities/user.entity';
import { CancelBookingDto, ConfirmBookingResponseDto, RescheduleBookingDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { BookingCompletedEvent } from '../events/booking-completed.event';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingRescheduledEvent } from '../events/booking-rescheduled.event';
import { BookingStateMachineService } from './booking-state-machine.service';
import { StaffConflictService } from './staff-conflict.service';

@Injectable()
export class BookingWorkflowService {
  constructor(
    private readonly financeService: FinanceService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
    private readonly stateMachine: BookingStateMachineService,
    private readonly staffConflictService: StaffConflictService,
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

      if (!booking.startTime) {
        throw new BadRequestException('booking.start_time_required_for_confirmation');
      }

      booking.durationMinutes = booking.servicePackage?.durationMinutes ?? booking.durationMinutes;

      if (booking.startTime && booking.durationMinutes > 0) {
        await this.ensureNoStaffConflict({
          packageId: booking.packageId,
          eventDate: booking.eventDate,
          startTime: booking.startTime,
          durationMinutes: booking.durationMinutes,
        });
      }

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
      const bookingLock = await manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bookingLock) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client'],
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      if (booking.status === BookingStatus.CANCELLED) {
        return booking;
      }

      const bookingTasks = await manager.find(Task, {
        where: { bookingId: booking.id, tenantId },
      });

      if (bookingTasks.some((task) => task.status === TaskStatus.COMPLETED)) {
        throw new BadRequestException('booking.cannot_cancel_with_completed_tasks');
      }

      if (bookingTasks.length > 0) {
        await manager.save(
          Task,
          bookingTasks.map((task) => ({ ...task, status: TaskStatus.CANCELLED })),
        );
      }

      const taskIds = bookingTasks.map((task) => task.id);
      const taskAssigneesByTaskId = new Map<string, TaskAssignee[]>();
      if (taskIds.length > 0) {
        const taskAssignees = await manager.find(TaskAssignee, {
          where: taskIds.map((taskId) => ({ tenantId, taskId })),
        });

        for (const assignee of taskAssignees) {
          const existing = taskAssigneesByTaskId.get(assignee.taskId) ?? [];
          existing.push(assignee);
          taskAssigneesByTaskId.set(assignee.taskId, existing);
        }
      }

      for (const task of bookingTasks) {
        const taskAssignees = taskAssigneesByTaskId.get(task.id) ?? [];
        if (taskAssignees.length > 0) {
          for (const assignee of taskAssignees) {
            const assigneeCommission = Number(assignee.commissionSnapshot) || 0;
            if (assigneeCommission > 0) {
              await this.financeService.transferPendingCommission(
                manager,
                assignee.userId,
                undefined,
                assigneeCommission,
              );
            }
          }
          continue;
        }

        const legacyCommission = Number(task.commissionSnapshot) || 0;
        if (task.assignedUserId && legacyCommission > 0) {
          await this.financeService.transferPendingCommission(
            manager,
            task.assignedUserId,
            undefined,
            legacyCommission,
          );
        }
      }

      const bookingIncomeTransactions = await manager.find(Transaction, {
        where: {
          tenantId,
          bookingId: booking.id,
          type: TransactionType.INCOME,
        },
      });

      const reversalAmount = bookingIncomeTransactions.reduce((sum, transaction) => {
        const amount = Number(transaction.amount) || 0;
        return amount > 0 ? sum + amount : sum;
      }, 0);

      const hasExistingReversal = bookingIncomeTransactions.some((transaction) => {
        const amount = Number(transaction.amount) || 0;
        const category = (transaction.category || '').toLowerCase();
        return amount < 0 || category.includes('refund') || category.includes('reversal');
      });

      if (reversalAmount > 0 && !hasExistingReversal) {
        await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.INCOME,
          amount: -reversalAmount,
          category: 'Booking Reversal',
          bookingId: booking.id,
          description: `Booking cancellation reversal: ${booking.client?.name || 'Unknown Client'}`,
          transactionDate: new Date(),
        });
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

  async rescheduleBooking(id: string, dto: RescheduleBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingRescheduledEvent | null = null;

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException('booking.only_confirmed_can_be_rescheduled');
      }

      const nextEventDate = new Date(dto.eventDate);
      const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
      if (nextEventDate < oneHourFromNow) {
        throw new BadRequestException('booking.event_date_must_be_future');
      }

      if (booking.packageId && booking.durationMinutes > 0) {
        await this.ensureNoStaffConflict({
          packageId: booking.packageId,
          eventDate: nextEventDate,
          startTime: dto.startTime,
          durationMinutes: booking.durationMinutes,
          excludeBookingId: booking.id,
        });
      }

      const bookingTasks = await manager.find(Task, {
        where: { bookingId: booking.id, tenantId },
      });

      if (bookingTasks.some((task) => task.status === TaskStatus.IN_PROGRESS)) {
        throw new BadRequestException('booking.cannot_reschedule_with_in_progress_tasks');
      }

      if (bookingTasks.some((task) => task.status === TaskStatus.COMPLETED)) {
        throw new BadRequestException('booking.cannot_reschedule_with_completed_tasks');
      }

      const taskIds = bookingTasks.map((task) => task.id);

      if (taskIds.length > 0) {
        const activeTimeEntries = await manager.find(TimeEntry, {
          where: taskIds.map((taskId) => ({
            tenantId,
            taskId,
            status: TimeEntryStatus.RUNNING,
          })),
        });

        if (activeTimeEntries.length > 0) {
          throw new BadRequestException('booking.cannot_reschedule_with_active_time_entries');
        }

        await manager.save(
          Task,
          bookingTasks.map((task) => ({
            ...task,
            dueDate: nextEventDate,
          })),
        );
      }

      const staffUserIds = new Set<string>();

      if (taskIds.length > 0) {
        const taskAssignees = await manager.find(TaskAssignee, {
          where: taskIds.map((taskId) => ({ tenantId, taskId })),
        });

        for (const assignee of taskAssignees) {
          staffUserIds.add(assignee.userId);
        }
      }

      for (const task of bookingTasks) {
        if (task.assignedUserId) {
          staffUserIds.add(task.assignedUserId);
        }
      }

      const notificationUsers =
        staffUserIds.size > 0
          ? await manager.find(User, {
              where: [...staffUserIds].map((staffUserId) => ({
                tenantId,
                id: staffUserId,
              })),
            })
          : [];

      const staffEmails = [...new Set(notificationUsers.map((user) => user.email).filter((email) => !!email))];

      booking.eventDate = nextEventDate;
      booking.startTime = dto.startTime;

      const saved = await manager.save(booking);

      eventToPublish = new BookingRescheduledEvent(saved.id, tenantId, saved.eventDate, saved.startTime, staffEmails);

      return saved;
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
      startTime: booking.startTime,
      durationMinutes: booking.durationMinutes,
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

  private async ensureNoStaffConflict(input: {
    packageId: string;
    eventDate: Date;
    startTime: string;
    durationMinutes: number;
    excludeBookingId?: string;
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
