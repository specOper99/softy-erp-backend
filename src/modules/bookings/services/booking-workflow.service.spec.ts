import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import {
  createMockConfigService,
  createMockDataSource,
  createMockQueryRunner,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { AuditPublisher } from '../../audit/audit.publisher';
import { Transaction } from '../../finance/entities/transaction.entity';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { TaskAssignee } from '../../tasks/entities/task-assignee.entity';
import { Task } from '../../tasks/entities/task.entity';
import { TimeEntry, TimeEntryStatus } from '../../tasks/entities/time-entry.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { User } from '../../users/entities/user.entity';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { BookingCompletedEvent } from '../events/booking-completed.event';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingRescheduledEvent } from '../events/booking-rescheduled.event';
import { BookingWorkflowService } from './booking-workflow.service';

import { BookingStateMachineService } from '../services/booking-state-machine.service';
import { StaffConflictService } from './staff-conflict.service';

describe('BookingWorkflowService', () => {
  let service: BookingWorkflowService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let financeService: FinanceService;
  let auditService: AuditPublisher;
  let eventBus: EventBus;
  let mockBooking: Partial<Booking>;
  let staffConflictService: { checkPackageStaffAvailability: jest.Mock };

  const mockStateMachine = {
    validateTransition: jest.fn(),
  };

  beforeEach(async () => {
    mockTenantContext('tenant-1');
    mockStateMachine.validateTransition.mockReset();

    mockBooking = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      status: BookingStatus.DRAFT,
      totalPrice: 100,
      subTotal: 90,
      taxRate: 10,
      taxAmount: 10,
      depositPercentage: 20,
      depositAmount: 20,
      amountPaid: 0,
      refundAmount: 0,
      eventDate: new Date(),
      startTime: '10:00',
      packageId: 'pkg-1',
      client: { name: 'Test Client', email: 'test@example.com' } as Booking['client'],
      servicePackage: {
        name: 'Test Package',
        durationMinutes: 90,
        packageItems: Promise.resolve([
          {
            taskTypeId: 'type-1',
            quantity: 2,
            taskType: { defaultCommissionAmount: 10 },
          },
        ]),
      } as unknown as Booking['servicePackage'],
    };

    const mockQR = createMockQueryRunner();
    // Custom save implementation for existing test behavior
    mockQR.manager.save.mockImplementation((targetOrEntity: unknown, maybeEntity: unknown) => {
      // Handle save(Entity, entities[]) signature
      if (maybeEntity && Array.isArray(maybeEntity)) return Promise.resolve(maybeEntity);
      // Handle save(entities[]) signature (if passed directly)
      if (Array.isArray(targetOrEntity)) return Promise.resolve(targetOrEntity);
      // Handle save(entity) or save(Entity, entity)
      return Promise.resolve(maybeEntity || targetOrEntity);
    });
    (mockQR.manager.find as jest.Mock).mockResolvedValue([
      {
        taskTypeId: 'type-1',
        quantity: 2,
        taskType: { defaultCommissionAmount: 10 },
      },
    ]);

    dataSource = createMockDataSource() as unknown as DataSource;
    (dataSource as unknown as { manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock } }).manager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    // Mock transaction to immediately execute callback with mock manager
    (dataSource.transaction as jest.Mock).mockImplementation((cb) => {
      return cb(mockQR.manager);
    });

    // We keep this just to get access to the manager for assertions
    (dataSource.createQueryRunner as jest.Mock).mockReturnValue(mockQR);
    queryRunner = dataSource.createQueryRunner();

    staffConflictService = {
      checkPackageStaffAvailability: jest.fn().mockResolvedValue({
        ok: true,
        requiredStaffCount: 1,
        eligibleCount: 1,
        busyCount: 0,
        availableCount: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingWorkflowService,
        {
          provide: FinanceService,
          useValue: {
            createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'tx-1' }),
            transferPendingCommission: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditPublisher,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            TASKS_LIMIT: 500, // Assuming key name based on usage, or generic mock
          }),
        },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
        { provide: BookingStateMachineService, useValue: mockStateMachine },
        { provide: StaffConflictService, useValue: staffConflictService },
      ],
    }).compile();

    service = module.get<BookingWorkflowService>(BookingWorkflowService);
    financeService = module.get<FinanceService>(FinanceService);
    auditService = module.get<AuditPublisher>(AuditPublisher);
    eventBus = module.get<EventBus>(EventBus);
  });

  describe('confirmBooking', () => {
    it('should successfully confirm a booking', async () => {
      // Mock finding booking (first for lock, second for data)
      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' }) // Lock
        .mockResolvedValueOnce(mockBooking); // Data

      const result = await service.confirmBooking('booking-1');

      expect(dataSource.transaction).toHaveBeenCalled();
      // findOne called twice: once for lock, once for data
      expect(queryRunner.manager.findOne).toHaveBeenCalledTimes(2);

      // Verify status update
      expect(mockBooking.status).toBe(BookingStatus.CONFIRMED);
      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: BookingStatus.CONFIRMED }),
      );

      // Verify tasks creation (2 tasks)
      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.anything(), // Task entity class
        expect.arrayContaining([
          expect.objectContaining({ bookingId: 'booking-1' }),
          expect.objectContaining({ bookingId: 'booking-1' }),
        ]),
      );

      // Verify Finance interaction
      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        queryRunner.manager,
        expect.objectContaining({
          type: TransactionType.INCOME,
          amount: 100,
        }),
      );

      // Verify Audit
      expect(auditService.log).toHaveBeenCalled();

      // Verify Event
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingConfirmedEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingConfirmedEvent;
      expect(event.bookingId).toBe('booking-1');
      expect(event.tenantId).toBe('tenant-1');

      expect(result.tasksCreated).toBe(2);
    });

    it('should propagate error', async () => {
      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(mockBooking);

      // Simulate Finance failure
      (financeService.createTransactionWithManager as jest.Mock).mockRejectedValue(new Error('Finance Error'));

      await expect(service.confirmBooking('booking-1')).rejects.toThrow('Finance Error');
    });

    it('should throw NotFoundException if booking not found', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.confirmBooking('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if booking is not DRAFT', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({ id: 'booking-1' }).mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      // Make the state machine reject invalid transitions
      mockStateMachine.validateTransition.mockImplementation(() => {
        throw new BadRequestException();
      });

      await expect(service.confirmBooking('booking-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject confirmation when startTime is missing', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({ id: 'booking-1' }).mockResolvedValueOnce({
        ...mockBooking,
        startTime: null,
      });

      await expect(service.confirmBooking('booking-1')).rejects.toThrow('booking.start_time_required_for_confirmation');
    });

    it('should reject confirmation when staff conflict exists', async () => {
      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(mockBooking);

      staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
        ok: false,
        requiredStaffCount: 2,
        eligibleCount: 2,
        busyCount: 1,
        availableCount: 1,
      });

      await expect(service.confirmBooking('booking-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('rescheduleBooking', () => {
    it('should reject reschedule when staff conflict exists', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        durationMinutes: 90,
      });

      staffConflictService.checkPackageStaffAvailability.mockResolvedValue({
        ok: false,
        requiredStaffCount: 2,
        eligibleCount: 2,
        busyCount: 2,
        availableCount: 0,
      });

      await expect(
        service.rescheduleBooking('booking-1', {
          eventDate: new Date(Date.now() + 172800000).toISOString(),
          startTime: '12:00',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reschedule booking when there is no conflict', async () => {
      const bookingToReschedule = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        durationMinutes: 90,
      } as Booking;

      const tasksToReschedule = [
        {
          id: 'task-1',
          bookingId: 'booking-1',
          tenantId: 'tenant-1',
          status: TaskStatus.PENDING,
          dueDate: new Date('2026-01-01T10:00:00Z'),
          assignedUserId: 'legacy-user-1',
        },
      ] as Task[];

      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(bookingToReschedule);
      queryRunner.manager.save = jest.fn().mockImplementation(async (targetOrEntity: unknown, maybeEntity: unknown) => {
        if (targetOrEntity === Task) {
          return maybeEntity as Task[];
        }
        return (maybeEntity || targetOrEntity) as Booking;
      });
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown, options?: { where?: unknown }) => {
        if (entity === Task) {
          return Promise.resolve(tasksToReschedule);
        }

        if (entity === TaskAssignee) {
          return Promise.resolve([
            {
              id: 'ta-1',
              taskId: 'task-1',
              userId: 'user-a',
              role: 'LEAD',
              tenantId: 'tenant-1',
            },
            {
              id: 'ta-2',
              taskId: 'task-1',
              userId: 'user-b',
              role: 'ASSISTANT',
              tenantId: 'tenant-1',
            },
          ] as TaskAssignee[]);
        }

        if (entity === User) {
          const where = options?.where as Array<{ id: string }>;
          const ids = where?.map((item) => item.id) ?? [];
          return Promise.resolve(
            ids.map((id) => ({
              id,
              email: `${id}@example.com`,
              tenantId: 'tenant-1',
            })),
          );
        }

        return Promise.resolve([]);
      });

      const dto = {
        eventDate: new Date(Date.now() + 172800000).toISOString(),
        startTime: '13:30',
      };

      const result = await service.rescheduleBooking('booking-1', dto);

      expect(staffConflictService.checkPackageStaffAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          packageId: bookingToReschedule.packageId,
          startTime: dto.startTime,
          durationMinutes: 90,
          excludeBookingId: 'booking-1',
        }),
      );
      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        Task,
        expect.arrayContaining([expect.objectContaining({ id: 'task-1', dueDate: new Date(dto.eventDate) })]),
      );
      expect(queryRunner.manager.save).toHaveBeenCalledWith(expect.objectContaining({ startTime: dto.startTime }));
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingRescheduledEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingRescheduledEvent;
      expect(event.staffEmails).toEqual(
        expect.arrayContaining(['legacy-user-1@example.com', 'user-a@example.com', 'user-b@example.com']),
      );
      expect(result.startTime).toBe(dto.startTime);
    });

    it('should block reschedule when booking has in-progress tasks', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve([
            {
              id: 'task-1',
              bookingId: 'booking-1',
              tenantId: 'tenant-1',
              status: TaskStatus.IN_PROGRESS,
            },
          ] as Task[]);
        }

        return Promise.resolve([]);
      });

      await expect(
        service.rescheduleBooking('booking-1', {
          eventDate: new Date(Date.now() + 172800000).toISOString(),
          startTime: '12:00',
        }),
      ).rejects.toThrow('booking.cannot_reschedule_with_in_progress_tasks');
      expect(queryRunner.manager.find).not.toHaveBeenCalledWith(TimeEntry, expect.anything());
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should block reschedule when booking has completed tasks', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve([
            {
              id: 'task-1',
              bookingId: 'booking-1',
              tenantId: 'tenant-1',
              status: TaskStatus.COMPLETED,
            },
          ] as Task[]);
        }

        return Promise.resolve([]);
      });

      await expect(
        service.rescheduleBooking('booking-1', {
          eventDate: new Date(Date.now() + 172800000).toISOString(),
          startTime: '12:00',
        }),
      ).rejects.toThrow('booking.cannot_reschedule_with_completed_tasks');
      expect(queryRunner.manager.find).not.toHaveBeenCalledWith(TimeEntry, expect.anything());
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should block reschedule when booking has active time entries', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve([
            {
              id: 'task-1',
              bookingId: 'booking-1',
              tenantId: 'tenant-1',
              status: TaskStatus.PENDING,
            },
          ] as Task[]);
        }

        if (entity === TimeEntry) {
          return Promise.resolve([
            {
              id: 'time-entry-1',
              taskId: 'task-1',
              tenantId: 'tenant-1',
              status: TimeEntryStatus.RUNNING,
            },
          ] as TimeEntry[]);
        }

        return Promise.resolve([]);
      });

      await expect(
        service.rescheduleBooking('booking-1', {
          eventDate: new Date(Date.now() + 172800000).toISOString(),
          startTime: '12:00',
        }),
      ).rejects.toThrow('booking.cannot_reschedule_with_active_time_entries');
      expect(queryRunner.manager.find).toHaveBeenCalledWith(TimeEntry, {
        where: [
          {
            tenantId: 'tenant-1',
            taskId: 'task-1',
            status: TimeEntryStatus.RUNNING,
          },
        ],
      });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('cancels tasks, reverses pending commissions, creates single reversal transaction, and publishes event', async () => {
      const bookingToCancel = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        eventDate: new Date(Date.now() + 86400000),
      } as Booking;

      const bookingTasks = [
        {
          id: 'task-1',
          bookingId: 'booking-1',
          tenantId: 'tenant-1',
          status: TaskStatus.PENDING,
          assignedUserId: 'legacy-user-1',
          commissionSnapshot: 25,
        },
      ] as Task[];

      const bookingTransactions = [
        { id: 'txn-1', amount: 80, category: 'Booking Payment' },
        { id: 'txn-2', amount: 20, category: 'Booking Payment' },
      ] as Transaction[];

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(bookingToCancel);
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve(bookingTasks);
        }
        if (entity === TaskAssignee) {
          return Promise.resolve([]);
        }
        if (entity === Transaction) {
          return Promise.resolve(bookingTransactions);
        }
        return Promise.resolve([]);
      });

      await service.cancelBooking('booking-1', { reason: 'Client request' });

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        Task,
        expect.arrayContaining([expect.objectContaining({ id: 'task-1', status: TaskStatus.CANCELLED })]),
      );
      expect(financeService.transferPendingCommission).toHaveBeenCalledWith(
        queryRunner.manager,
        'legacy-user-1',
        undefined,
        25,
      );
      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        queryRunner.manager,
        expect.objectContaining({
          type: TransactionType.INCOME,
          amount: -100,
          bookingId: 'booking-1',
          category: 'Booking Reversal',
        }),
      );

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingCancelledEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingCancelledEvent;
      expect(event.bookingId).toBe('booking-1');
      expect(event.tenantId).toBe('tenant-1');
      expect(event.cancellationReason).toBe('Client request');
    });

    it('is idempotent when cancellation is retried', async () => {
      const bookingToCancel = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        eventDate: new Date(Date.now() + 86400000),
      } as Booking;

      const bookingTasks = [
        {
          id: 'task-1',
          bookingId: 'booking-1',
          tenantId: 'tenant-1',
          status: TaskStatus.PENDING,
          assignedUserId: 'legacy-user-1',
          commissionSnapshot: 15,
        },
      ] as Task[];

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(bookingToCancel)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(bookingToCancel);
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve(bookingTasks);
        }
        if (entity === TaskAssignee) {
          return Promise.resolve([]);
        }
        if (entity === Transaction) {
          return Promise.resolve([{ id: 'txn-1', amount: 200, category: 'Booking Payment' }] as Transaction[]);
        }
        return Promise.resolve([]);
      });

      await service.cancelBooking('booking-1', { reason: 'Client request' });
      await service.cancelBooking('booking-1', { reason: 'Client request' });

      expect(financeService.createTransactionWithManager).toHaveBeenCalledTimes(1);
      expect(financeService.transferPendingCommission).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('blocks cancellation when any booking task is completed', async () => {
      const bookingToCancel = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        eventDate: new Date(Date.now() + 86400000),
      } as Booking;

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(bookingToCancel);
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve([
            {
              id: 'task-1',
              bookingId: 'booking-1',
              tenantId: 'tenant-1',
              status: TaskStatus.COMPLETED,
            },
          ] as Task[]);
        }
        return Promise.resolve([]);
      });

      await expect(service.cancelBooking('booking-1', { reason: 'Client request' })).rejects.toThrow(
        'booking.cannot_cancel_with_completed_tasks',
      );
      expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
      expect(financeService.transferPendingCommission).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('reverses pending commissions for all task assignees (multi-assignee aware)', async () => {
      const bookingToCancel = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        eventDate: new Date(Date.now() + 86400000),
      } as Booking;

      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(bookingToCancel);
      (queryRunner.manager.find as jest.Mock).mockImplementation((entity: unknown) => {
        if (entity === Task) {
          return Promise.resolve([
            {
              id: 'task-1',
              bookingId: 'booking-1',
              tenantId: 'tenant-1',
              status: TaskStatus.IN_PROGRESS,
              assignedUserId: 'legacy-user-1',
              commissionSnapshot: 99,
            },
          ] as Task[]);
        }
        if (entity === TaskAssignee) {
          return Promise.resolve([
            {
              id: 'ta-1',
              taskId: 'task-1',
              userId: 'user-a',
              commissionSnapshot: 10,
              tenantId: 'tenant-1',
            },
            {
              id: 'ta-2',
              taskId: 'task-1',
              userId: 'user-b',
              commissionSnapshot: 15,
              tenantId: 'tenant-1',
            },
          ] as TaskAssignee[]);
        }
        if (entity === Transaction) {
          return Promise.resolve([{ id: 'txn-1', amount: 120, category: 'Booking Payment' }] as Transaction[]);
        }
        return Promise.resolve([]);
      });

      await service.cancelBooking('booking-1', { reason: 'Client request' });

      expect(financeService.transferPendingCommission).toHaveBeenCalledTimes(2);
      expect(financeService.transferPendingCommission).toHaveBeenNthCalledWith(
        1,
        queryRunner.manager,
        'user-a',
        undefined,
        10,
      );
      expect(financeService.transferPendingCommission).toHaveBeenNthCalledWith(
        2,
        queryRunner.manager,
        'user-b',
        undefined,
        15,
      );
    });
  });

  describe('completeBooking', () => {
    it('publishes BookingCompletedEvent once after completion commit', async () => {
      const completedBooking = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      };

      (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(completedBooking);
      (queryRunner.manager.find as jest.Mock).mockResolvedValue([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]);

      await service.completeBooking('booking-1');

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingCompletedEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingCompletedEvent;
      expect(event.bookingId).toBe('booking-1');
      expect(event.tenantId).toBe('tenant-1');
    });
  });

  describe('duplicateBooking', () => {
    it('publishes BookingCreatedEvent once for duplicated booking', async () => {
      const savedDuplicate = {
        ...mockBooking,
        id: 'booking-2',
        createdAt: new Date(),
      };

      (dataSource.manager as unknown as { findOne: jest.Mock; create: jest.Mock; save: jest.Mock }).findOne = jest
        .fn()
        .mockResolvedValue(mockBooking);
      const mockCreate = jest.fn().mockReturnValue(savedDuplicate);
      const mockSave = jest.fn().mockResolvedValue(savedDuplicate);
      (dataSource.manager as unknown as { findOne: jest.Mock; create: jest.Mock; save: jest.Mock }).create = mockCreate;
      (dataSource.manager as unknown as { findOne: jest.Mock; create: jest.Mock; save: jest.Mock }).save = mockSave;

      await service.duplicateBooking('booking-1');

      expect(mockCreate).toHaveBeenCalledWith(
        Booking,
        expect.objectContaining({
          clientId: mockBooking.clientId,
          eventDate: mockBooking.eventDate,
          packageId: mockBooking.packageId,
          totalPrice: mockBooking.totalPrice,
          subTotal: mockBooking.subTotal,
          taxRate: mockBooking.taxRate,
          taxAmount: mockBooking.taxAmount,
          depositPercentage: mockBooking.depositPercentage,
          depositAmount: mockBooking.depositAmount,
          amountPaid: 0,
          refundAmount: 0,
          status: BookingStatus.DRAFT,
          tenantId: mockBooking.tenantId,
        }),
      );

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingCreatedEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingCreatedEvent;
      expect(event.bookingId).toBe('booking-2');
      expect(event.tenantId).toBe('tenant-1');
    });
  });
});
