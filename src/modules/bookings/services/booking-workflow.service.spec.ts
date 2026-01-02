import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { BookingStatus, TransactionType } from '../../../common/enums';
import { AuditService } from '../../audit/audit.service';
import { FinanceService } from '../../finance/services/finance.service';
import { BookingWorkflowService } from './booking-workflow.service';

describe('BookingWorkflowService', () => {
  let service: BookingWorkflowService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let financeService: FinanceService;
  let auditService: AuditService;
  let eventBus: EventBus;
  let mockBooking: any;

  beforeEach(async () => {
    mockBooking = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      status: BookingStatus.DRAFT,
      totalPrice: 100,
      eventDate: new Date(),
      client: { name: 'Test Client', email: 'test@example.com' },
      servicePackage: {
        name: 'Test Package',
        packageItems: Promise.resolve([
          {
            taskTypeId: 'type-1',
            quantity: 2,
            taskType: { defaultCommissionAmount: 10 },
          },
        ]),
      },
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn().mockImplementation((targetOrEntity, maybeEntity) => {
          // Handle save(Entity, entities[]) signature
          if (maybeEntity && Array.isArray(maybeEntity))
            return Promise.resolve(maybeEntity);
          // Handle save(entities[]) signature (if passed directly)
          if (Array.isArray(targetOrEntity))
            return Promise.resolve(targetOrEntity);
          // Handle save(entity) or save(Entity, entity)
          return Promise.resolve(maybeEntity || targetOrEntity);
        }),
      },
    } as unknown as QueryRunner;

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingWorkflowService,
        {
          provide: FinanceService,
          useValue: {
            createTransactionWithManager: jest
              .fn()
              .mockResolvedValue({ id: 'tx-1' }),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(500), // Max tasks limit
          },
        },
        {
          provide: EventBus,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookingWorkflowService>(BookingWorkflowService);
    financeService = module.get<FinanceService>(FinanceService);
    auditService = module.get<AuditService>(AuditService);
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
      (
        financeService.createTransactionWithManager as jest.Mock
      ).mockRejectedValue(new Error('Finance Error'));

      await expect(service.confirmBooking('booking-1')).rejects.toThrow(
        'Finance Error',
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException if booking not found', async () => {
      (queryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.confirmBooking('invalid-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if booking is not DRAFT', async () => {
      (queryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'booking-1' })
        .mockResolvedValueOnce({
          ...mockBooking,
          status: BookingStatus.CONFIRMED,
        });

      await expect(service.confirmBooking('booking-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
