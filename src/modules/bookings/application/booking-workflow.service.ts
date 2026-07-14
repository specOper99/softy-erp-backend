import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { differenceInCalendarDays } from 'date-fns';
import { DataSource } from 'typeorm';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { OutboxEvent } from '../../../common/entities/outbox-event.entity';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { AuditPublisher } from '../../audit/application/audit.publisher';
import { FinanceService } from '../../finance/application/finance.service';
import { InvoiceService } from '../../finance/application/invoice.service';
import { Transaction } from '../../finance/domain/entities/transaction.entity';
import { TransactionType } from '../../finance/domain/enums/transaction-type.enum';
import { TaskAssignee } from '../../tasks/domain/entities/task-assignee.entity';
import { Task } from '../../tasks/domain/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/domain/entities/time-entry.entity';
import { TaskStatus } from '../../tasks/domain/enums/task-status.enum';
import { User } from '../../users/domain/entities/user.entity';
import { CancelBookingDto, ConfirmBookingResponseDto, RescheduleBookingDto } from '../api/dto';
import { Booking } from '../domain/entities/booking.entity';
import { ProcessingType } from '../domain/entities/processing-type.entity';
import { BookingStatus } from '../domain/enums/booking-status.enum';
import { BookingCancelledEvent } from '../domain/events/booking-cancelled.event';
import { BookingCompletedEvent } from '../domain/events/booking-completed.event';
import { BookingConfirmedEvent } from '../domain/events/booking-confirmed.event';
import { BookingCreatedEvent } from '../domain/events/booking-created.event';
import { BookingRescheduledEvent } from '../domain/events/booking-rescheduled.event';
import { BookingStateMachineService } from './booking-state-machine.service';
import { StaffConflictService } from './staff-conflict.service';

@Injectable()
export class BookingWorkflowService {
  private readonly logger = new Logger(BookingWorkflowService.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
    private readonly stateMachine: BookingStateMachineService,
    private readonly staffConflictService: StaffConflictService,
    private readonly invoiceService: InvoiceService,
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
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
  async confirmBooking(id: string, skipAvailabilityCheck = false): Promise<ConfirmBookingResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingConfirmedEvent | null = null;

    const result = await this.dataSource.transaction(async (manager) => {
      // Step 1: Acquire pessimistic lock to prevent race conditions
      const bookingLock = await manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bookingLock) {
        throw new NotFoundException('booking.not_found');
      }

      // Step 2: Fetch actual data with relations.
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client', 'servicePackage'],
      });

      if (!booking) {
        throw new NotFoundException('booking.not_found');
      }

      this.stateMachine.validateTransition(booking.status, BookingStatus.CONFIRMED);

      if (!booking.startTime) {
        throw new BadRequestException('booking.start_time_required_for_confirmation');
      }

      booking.durationMinutes = booking.servicePackage?.durationMinutes ?? booking.durationMinutes;

      if (booking.startTime && booking.durationMinutes > 0 && !skipAvailabilityCheck) {
        await this.ensureNoStaffConflict({
          packageId: booking.packageId,
          eventDate: booking.eventDate,
          startTime: booking.startTime,
          durationMinutes: booking.durationMinutes,
        });
      }

      booking.status = BookingStatus.CONFIRMED;
      await manager.save(booking);

      // Step 3: Generate Tasks from booking's selected processing types (one task per type)
      const bookingWithPT = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['processingTypes'],
      });
      const processingTypes: ProcessingType[] = bookingWithPT?.processingTypes ?? [];
      const tasksToCreate: Partial<Task>[] = [];
      const maxTasks = this.configService.get<number>('booking.maxTasksPerBooking', 500);

      if (processingTypes.length > maxTasks) {
        throw new BadRequestException(
          `Cannot confirm booking: total tasks requested(${processingTypes.length}) exceeds the maximum allowed limit of ${maxTasks} per booking.`,
        );
      }

      for (const pt of processingTypes) {
        tasksToCreate.push({
          bookingId: booking.id,
          processingTypeId: pt.id,
          status: TaskStatus.PENDING,
          commissionSnapshot: Number(pt.defaultCommissionAmount) || 0,
          dueDate: booking.eventDate,
          tenantId: booking.tenantId,
          locationLink: booking.locationLink ?? null,
        });
      }

      const createdTasks = await manager.save(Task, tasksToCreate);

      const depositAmount = Number(booking.depositAmount) || 0;
      const alreadyPaid = Number(booking.amountPaid) || 0;
      let transactionId: string | null = null;
      let depositTx: Transaction | null = null;

      if (depositAmount > 0 && alreadyPaid < depositAmount) {
        const remainingDeposit = depositAmount - alreadyPaid;

        depositTx = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.INCOME,
          amount: remainingDeposit,
          category: 'Booking Deposit',
          bookingId: booking.id,
          description: `Deposit payment on confirm: ${booking.client?.name || 'Unknown Client'} - ${booking.servicePackage?.name}`,
          transactionDate: new Date(),
          revenueAccountCode: booking.servicePackage?.revenueAccountCode,
        });
        transactionId = depositTx.id;

        booking.amountPaid = alreadyPaid + remainingDeposit;
        booking.paymentStatus = booking.derivePaymentStatus();
        await manager.save(booking);
      }

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

      await manager.save(OutboxEvent, {
        aggregateId: booking.id,
        aggregateType: 'Booking',
        type: 'BookingConfirmedEvent',
        tenantId: booking.tenantId,
        occurredAt: new Date(),
        payload: {
          bookingId: booking.id,
          tenantId: booking.tenantId,
          clientEmail: booking.client?.email || '',
          clientName: booking.client?.name || 'Client',
          packageName: booking.servicePackage?.name || 'Service Package',
          totalPrice: Number(booking.totalPrice),
          eventDate: booking.eventDate,
        },
      });

      return {
        booking,
        tasksCreated: createdTasks.length,
        transactionId,
        depositTx,
      };
    });

    // Step 5: Auto-generate invoice (non-blocking; failure does not roll back confirm)
    try {
      await this.invoiceService.createInvoice(result.booking.id);
    } catch (error) {
      // Log so the billing gap is visible in monitoring — someone must manually
      // retry or create the invoice. Silent swallow here is intentional (the
      // booking is confirmed regardless) but the failure must not be invisible.
      this.logger.error(
        `Invoice generation failed for booking ${result.booking.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // Notify after commit so events and caches never reflect rolled-back data.
    if (result.depositTx) {
      await this.financeService.notifyTransactionCreated(result.depositTx);
    }

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    await this.invalidateAvailabilityCache(result.booking);

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
        throw new NotFoundException('booking.not_found');
      }

      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client'],
      });

      if (!booking) {
        throw new NotFoundException('booking.not_found');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        return { booking, reversalTx: null };
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

      let reversalTx: Transaction | null = null;
      if (reversalAmount > 0 && !hasExistingReversal) {
        reversalTx = await this.financeService.createTransactionWithManager(manager, {
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
      // Gap 4: Sync paymentStatus after reversal
      booking.paymentStatus = booking.derivePaymentStatus();

      const saved = await manager.save(booking);

      await this.auditService.log({
        action: 'STATUS_CHANGE',
        entityName: 'Booking',
        entityId: booking.id,
        oldValues: { status: oldStatus },
        newValues: { status: BookingStatus.CANCELLED },
      });

      const daysBeforeEvent = differenceInCalendarDays(booking.eventDate, new Date());

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

      await manager.save(OutboxEvent, {
        aggregateId: saved.id,
        aggregateType: 'Booking',
        type: 'BookingCancelledEvent',
        tenantId: saved.tenantId,
        occurredAt: booking.cancelledAt ?? new Date(),
        payload: {
          bookingId: saved.id,
          tenantId: saved.tenantId,
          clientEmail: saved.client?.email || '',
          clientName: saved.client?.name || '',
          eventDate: saved.eventDate,
          cancelledAt: booking.cancelledAt,
          daysBeforeEvent,
          cancellationReason: dto?.reason || '',
          amountPaid: Number(saved.amountPaid || 0),
          refundAmount: Number(saved.refundAmount || 0),
          refundPercentage: 0,
        },
      });

      return { booking: saved, reversalTx };
    });

    // Notify after commit so events and caches never reflect rolled-back data.
    if (savedBooking.reversalTx) {
      await this.financeService.notifyTransactionCreated(savedBooking.reversalTx);
    }

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    await this.invalidateAvailabilityCache(savedBooking.booking);

    return savedBooking.booking;
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
        throw new NotFoundException('booking.not_found');
      }

      const oldStatus = booking.status;

      this.stateMachine.validateTransition(booking.status, BookingStatus.COMPLETED);

      const tasksArray = await manager.find(Task, {
        where: { bookingId: booking.id, tenantId },
      });
      if (!tasksArray || tasksArray.length === 0) {
        // Warning: This logic assumes a complete booking SHOULD have tasks.
        throw new BadRequestException('booking.no_tasks_found');
      }
      const pendingTasks = tasksArray.filter((t) => t.status !== TaskStatus.COMPLETED);
      if (pendingTasks.length > 0) {
        throw new BadRequestException('booking.pending_tasks_blocking');
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

      await manager.save(OutboxEvent, {
        aggregateId: savedBooking.id,
        aggregateType: 'Booking',
        type: 'BookingCompletedEvent',
        tenantId: savedBooking.tenantId,
        occurredAt: new Date(),
        payload: {
          bookingId: savedBooking.id,
          tenantId: savedBooking.tenantId,
          completedAt: new Date().toISOString(),
        },
      });

      return savedBooking;
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    await this.invalidateAvailabilityCache(savedBooking);

    return savedBooking;
  }

  async rescheduleBooking(id: string, dto: RescheduleBookingDto, skipAvailabilityCheck = false): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingRescheduledEvent | null = null;
    let previousDate: Date | null = null;

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!booking) {
        throw new NotFoundException('booking.not_found');
      }

      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException('booking.only_confirmed_can_be_rescheduled');
      }

      previousDate = new Date(booking.eventDate);

      const nextEventDate = new Date(dto.eventDate);
      const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
      if (nextEventDate < oneHourFromNow) {
        throw new BadRequestException('booking.event_date_must_be_future');
      }

      if (booking.packageId && booking.durationMinutes > 0 && !skipAvailabilityCheck) {
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

      await manager.save(OutboxEvent, {
        aggregateId: saved.id,
        aggregateType: 'Booking',
        type: 'BookingRescheduledEvent',
        tenantId,
        occurredAt: new Date(),
        payload: {
          bookingId: saved.id,
          tenantId,
          eventDate: saved.eventDate,
          startTime: saved.startTime,
          staffEmails,
        },
      });

      return saved;
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

    if (previousDate) {
      await this.invalidateAvailabilityCache(savedBooking, previousDate);
    }

    return savedBooking;
  }

  async duplicateBooking(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let eventToPublish: BookingCreatedEvent | null = null;

    const savedBooking = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, tenantId },
        relations: ['client', 'servicePackage'],
      });

      if (!booking) {
        throw new NotFoundException('booking.not_found');
      }

      const newBooking = manager.create(Booking, {
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
        locationLink: booking.locationLink,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.DRAFT,
        tenantId,
      });

      const savedDuplicate = await manager.save(Booking, newBooking);

      await this.auditService.log({
        action: 'DUPLICATE',
        entityName: 'Booking',
        entityId: savedDuplicate.id,
        oldValues: { originalBookingId: id },
        newValues: { newBookingId: savedDuplicate.id },
      });

      const clientEmail = booking.client?.email || '';
      const clientName = booking.client?.name || '';
      const packageName = booking.servicePackage?.name || '';

      eventToPublish = new BookingCreatedEvent(
        savedDuplicate.id,
        tenantId,
        savedDuplicate.clientId,
        clientEmail,
        clientName,
        savedDuplicate.packageId,
        packageName,
        Number(savedDuplicate.totalPrice),
        null,
        savedDuplicate.eventDate,
        savedDuplicate.createdAt,
      );

      await manager.save(OutboxEvent, {
        aggregateId: savedDuplicate.id,
        aggregateType: 'Booking',
        type: 'BookingCreatedEvent',
        tenantId,
        occurredAt: savedDuplicate.createdAt,
        payload: {
          bookingId: savedDuplicate.id,
          tenantId,
          clientId: savedDuplicate.clientId,
          clientEmail,
          clientName,
          packageId: savedDuplicate.packageId,
          packageName,
          totalPrice: Number(savedDuplicate.totalPrice),
          assignedUserId: null,
          eventDate: savedDuplicate.eventDate,
          createdAt: savedDuplicate.createdAt,
        },
      });

      return savedDuplicate;
    });

    if (eventToPublish) {
      this.eventBus.publish(eventToPublish);
    }

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
      code: 'booking.staff_conflict',
      details: {
        requiredStaffCount: availability.requiredStaffCount,
        eligibleCount: availability.eligibleCount,
        busyCount: availability.busyCount,
        availableCount: availability.availableCount,
      },
    });
  }

  private async invalidateAvailabilityCache(booking: Booking, additionalDate?: Date): Promise<void> {
    if (!booking.packageId) {
      return;
    }

    const targetDates = [booking.eventDate, additionalDate].filter((value): value is Date => value instanceof Date);
    if (targetDates.length === 0) {
      return;
    }

    const uniqueDateStrings = [...new Set(targetDates.map((date) => date.toISOString().split('T')[0] ?? ''))].filter(
      (value) => value.length > 0,
    );

    for (const dateStr of uniqueDateStrings) {
      try {
        await this.availabilityCacheOwner.delAvailability(booking.tenantId, booking.packageId, dateStr);
      } catch (err) {
        const message = toErrorMessage(err);
        this.logger.warn(`Failed to invalidate availability cache: ${message}`);
      }
    }
  }
}
