import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { RecurringStatus, RecurringTransaction } from '../entities/recurring-transaction.entity';

import { TransactionType } from '../enums/transaction-type.enum';
import { RecurringTransactionRepository } from '../repositories/recurring-transaction.repository';
import { FinanceService } from './finance.service';
import { RecurringTransactionService } from './recurring-transaction.service';

describe('RecurringTransactionService', () => {
  let service: RecurringTransactionService;
  let recurringRepo: MockRepository<RecurringTransaction>;
  let financeService: jest.Mocked<FinanceService>;

  const mockTenantId = 'tenant-123';
  const mockRecurringTransaction = {
    id: 'rt-123',
    tenantId: mockTenantId,
    name: 'Monthly Rent',
    type: TransactionType.EXPENSE,
    amount: 5000,
    currency: 'USD',
    pattern: 'MONTHLY',
    status: RecurringStatus.ACTIVE,
    nextRunDate: new Date(),
    runCount: 0,
    calculateNextRunDate: jest.fn().mockReturnValue(new Date()),
    isComplete: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
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
        pattern: 'MONTHLY',
      };
      recurringRepo.create.mockReturnValue(mockRecurringTransaction as any);
      recurringRepo.save.mockResolvedValue(mockRecurringTransaction as any);

      const result = await service.create(dto as any);

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
      recurringRepo.find.mockResolvedValue([mockRecurringTransaction] as any);

      const mockPaginationDto = {
        getSkip: () => 0,
        getTake: () => 20,
      };

      const result = await service.findAll(mockPaginationDto as any);

      expect(recurringRepo.find).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return recurring transaction by id', async () => {
      recurringRepo.findOne.mockResolvedValue(mockRecurringTransaction as any);

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
      const dto = { amount: 6000 };
      recurringRepo.findOne.mockResolvedValue({
        ...mockRecurringTransaction,
      } as any);
      recurringRepo.save.mockResolvedValue({
        ...mockRecurringTransaction,
        amount: 6000,
      } as any);

      const result = await service.update('rt-123', dto as any);

      expect(result.amount).toBe(6000);
    });
  });

  describe('remove', () => {
    it('should remove recurring transaction', async () => {
      recurringRepo.findOne.mockResolvedValue(mockRecurringTransaction as any);
      recurringRepo.remove.mockResolvedValue(mockRecurringTransaction as any);

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
      recurringRepo.find.mockResolvedValue(dueTransactions as any);
      financeService.createSystemTransaction.mockResolvedValue({
        id: 'tx-1',
      } as any);
      recurringRepo.save.mockResolvedValue({
        ...mockRecurringTransaction,
        runCount: 1,
      } as any);

      await service.processDueTransactions();

      expect(financeService.createSystemTransaction).toHaveBeenCalled();
      expect(recurringRepo.save).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const dueTransactions = [{ ...mockRecurringTransaction }];
      recurringRepo.find.mockResolvedValue(dueTransactions as any);
      financeService.createSystemTransaction.mockRejectedValue(new Error('Failed'));

      // Should not throw
      await expect(service.processDueTransactions()).resolves.not.toThrow();
    });
  });
});
