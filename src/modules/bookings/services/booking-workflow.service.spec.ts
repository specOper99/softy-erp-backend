import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import {
  createMockConfigService,
  createMockDataSource,
  createMockQueryRunner,
} from '../../../../test/helpers/mock-factories';
import { AuditPublisher } from '../../audit/audit.publisher';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { Task } from '../../tasks/entities/task.entity';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';
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
    mockBooking = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      status: BookingStatus.DRAFT,
      totalPrice: 100,
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
      // Tasks relation mock
      tasks: Promise.resolve([]) as Promise<Task[]>,
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

    dataSource = createMockDataSource() as unknown as DataSource;
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
        {
          provide: DashboardGateway,
          useValue: {
            broadcastMetricsUpdate: jest.fn(),
          },
        },
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

      expect(queryRunner.connect).toHaveBeenCalled();
      expect(queryRunner.startTransaction).toHaveBeenCalled();
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
      expect(eventBus.publish).toHaveBeenCalled();

      // Verify Commit and Release
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();

      expect(result.tasksCreated).toBe(2);
    });

    it('should rollback interaction on error', async () => {
      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce(mockBooking);

      // Simulate Finance failure
      (financeService.createTransactionWithManager as jest.Mock).mockRejectedValue(new Error('Finance Error'));

      await expect(service.confirmBooking('booking-1')).rejects.toThrow('Finance Error');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException if booking not found', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.confirmBooking('invalid-id')).rejects.toThrow(NotFoundException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
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

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
