import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { BookingCompletedEvent } from '../events/booking-completed.event';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { BookingWorkflowService } from './booking-workflow.service';

import { BookingStateMachineService } from '../services/booking-state-machine.service';

describe('BookingWorkflowService', () => {
  let service: BookingWorkflowService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let financeService: FinanceService;
  let auditService: AuditPublisher;
  let eventBus: EventBus;
  let mockBooking: Partial<Booking>;

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
      client: { name: 'Test Client', email: 'test@example.com' } as Booking['client'],
      servicePackage: {
        name: 'Test Package',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingWorkflowService,
        {
          provide: FinanceService,
          useValue: {
            createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'tx-1' }),
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
  });

  describe('cancelBooking', () => {
    it('publishes BookingCancelledEvent once after cancellation commit', async () => {
      const cancelledAt = new Date();
      const bookingToCancel = {
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
        eventDate: new Date(Date.now() + 86400000),
      };

      (queryRunner.manager.findOne as jest.Mock).mockResolvedValue(bookingToCancel);
      queryRunner.manager.save = jest.fn().mockImplementation(async (entity) => ({ ...entity, cancelledAt }));

      await service.cancelBooking('booking-1', { reason: 'Client request' });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(expect.any(BookingCancelledEvent));
      const event = (eventBus.publish as jest.Mock).mock.calls[0][0] as BookingCancelledEvent;
      expect(event.bookingId).toBe('booking-1');
      expect(event.tenantId).toBe('tenant-1');
      expect(event.cancellationReason).toBe('Client request');
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
