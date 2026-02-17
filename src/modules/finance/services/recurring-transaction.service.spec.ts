import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  createMockRecurringTransaction,
  createMockRepository,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { CreateRecurringTransactionDto, UpdateRecurringTransactionDto } from '../dto/recurring-transaction.dto';
import { RecurringFrequency, RecurringStatus, RecurringTransaction } from '../entities/recurring-transaction.entity';
import { Transaction } from '../entities/transaction.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { RecurringTransactionRepository } from '../repositories/recurring-transaction.repository';
import { FinanceService } from './finance.service';
import { RecurringTransactionService } from './recurring-transaction.service';

describe('RecurringTransactionService', () => {
  let service: RecurringTransactionService;
  let recurringRepo: MockRepository<RecurringTransaction>;
  let financeService: jest.Mocked<FinanceService>;
  let rawRecurringQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };

  const mockTenantId = 'tenant-123';
  const mockRecurringTransaction = createMockRecurringTransaction({
    id: 'rt-123',
    tenantId: mockTenantId,
    name: 'Monthly Rent',
    type: TransactionType.EXPENSE,
    amount: 5000,
    currency: 'USD',
    frequency: RecurringFrequency.MONTHLY,
    status: RecurringStatus.ACTIVE,
    nextRunDate: new Date(),
    runCount: 0,
    calculateNextRunDate: jest.fn().mockReturnValue(new Date()),
    isComplete: jest.fn().mockReturnValue(false),
  }) as unknown as RecurringTransaction;

  beforeEach(async () => {
    rawRecurringQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionService,
        {
          provide: RecurringTransactionRepository,
          useValue: createMockRepository(),
        },
        {
          provide: FinanceService,
          useValue: {
            createSystemTransaction: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            createQueryBuilder: jest.fn().mockReturnValue(rawRecurringQueryBuilder),
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              query: jest.fn().mockResolvedValue([]),
              manager: {
                save: jest.fn(),
              },
            }),
          },
        },
        {
          provide: DistributedLockService,
          useValue: {
            withLock: jest.fn().mockImplementation(async (_key: string, callback: () => Promise<unknown>) => {
              return callback();
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RecurringTransactionService>(RecurringTransactionService);
    recurringRepo = module.get(RecurringTransactionRepository);
    financeService = module.get(FinanceService);

    mockTenantContext(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create recurring transaction', async () => {
      const dto = {
        name: 'Monthly Rent',
        type: TransactionType.EXPENSE,
        amount: 5000,
        startDate: '2024-01-01',
        frequency: RecurringFrequency.MONTHLY,
      } as CreateRecurringTransactionDto;
      recurringRepo.create.mockReturnValue(mockRecurringTransaction);
      recurringRepo.save.mockResolvedValue(mockRecurringTransaction);

      const result = await service.create(dto);

      expect(recurringRepo.create).toHaveBeenCalledWith({
        ...dto,
        nextRunDate: expect.any(Date),
        status: RecurringStatus.ACTIVE,
      });
      expect(result).toEqual(mockRecurringTransaction);
    });
  });

  describe('findAll', () => {
    it('should return all recurring transactions for tenant', async () => {
      recurringRepo.find.mockResolvedValue([mockRecurringTransaction]);

      const mockPaginationDto = {
        getSkip: () => 0,
        getTake: () => 20,
      } as unknown as PaginationDto;

      const result = await service.findAll(mockPaginationDto);

      expect(recurringRepo.find).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return recurring transaction by id', async () => {
      recurringRepo.findOne.mockResolvedValue(mockRecurringTransaction);

      const result = await service.findOne('rt-123');

      expect(recurringRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'rt-123' },
      });
      expect(result).toEqual(mockRecurringTransaction);
    });

    it('should throw NotFoundException when not found', async () => {
      recurringRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update recurring transaction', async () => {
      const dto = { amount: 6000 } as UpdateRecurringTransactionDto;
      recurringRepo.findOne.mockResolvedValue({
        ...mockRecurringTransaction,
      } as unknown as RecurringTransaction);
      recurringRepo.save.mockResolvedValue({
        ...mockRecurringTransaction,
        amount: 6000,
      } as unknown as RecurringTransaction);

      const result = await service.update('rt-123', dto);

      expect(result.amount).toBe(6000);
    });
  });

  describe('remove', () => {
    it('should remove recurring transaction', async () => {
      recurringRepo.findOne.mockResolvedValue(mockRecurringTransaction);
      recurringRepo.remove.mockResolvedValue(mockRecurringTransaction);

      await service.remove('rt-123');

      expect(recurringRepo.remove).toHaveBeenCalledWith(mockRecurringTransaction);
    });

    it('should throw NotFoundException when not found', async () => {
      recurringRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('processDueTransactions', () => {
    it('should process due transactions', async () => {
      const dueTransactions = [{ ...mockRecurringTransaction }];
      rawRecurringQueryBuilder.getMany.mockResolvedValue(dueTransactions);
      financeService.createSystemTransaction.mockResolvedValue({
        id: 'tx-1',
      } as Transaction);
      recurringRepo.save.mockResolvedValue({
        ...mockRecurringTransaction,
        runCount: 1,
      } as unknown as RecurringTransaction);

      await service.processDueTransactions();

      expect(financeService.createSystemTransaction).toHaveBeenCalled();
      expect(recurringRepo.save).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const dueTransactions = [{ ...mockRecurringTransaction }];
      rawRecurringQueryBuilder.getMany.mockResolvedValue(dueTransactions);
      financeService.createSystemTransaction.mockRejectedValue(new Error('Failed'));

      // Should not throw
      await expect(service.processDueTransactions()).resolves.not.toThrow();
    });
  });
});
