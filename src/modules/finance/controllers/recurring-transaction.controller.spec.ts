import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RecurringStatus } from '../entities/recurring-transaction.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { RecurringTransactionService } from '../services/recurring-transaction.service';
import { RecurringTransactionController } from './recurring-transaction.controller';

describe('RecurringTransactionController', () => {
  let controller: RecurringTransactionController;
  let service: jest.Mocked<RecurringTransactionService>;

  const mockRecurringTransaction = {
    id: 'rt-123',
    name: 'Monthly Rent',
    type: TransactionType.EXPENSE,
    amount: 5000,
    status: RecurringStatus.ACTIVE,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecurringTransactionController],
      providers: [
        {
          provide: RecurringTransactionService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<RecurringTransactionController>(
      RecurringTransactionController,
    );
    service = module.get(RecurringTransactionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
      service.create.mockResolvedValue(mockRecurringTransaction as any);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockRecurringTransaction);
    });
  });

  describe('findAll', () => {
    it('should return all recurring transactions', async () => {
      service.findAll.mockResolvedValue([mockRecurringTransaction] as any);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return recurring transaction by id', async () => {
      service.findOne.mockResolvedValue(mockRecurringTransaction as any);

      const result = await controller.findOne('rt-123');

      expect(service.findOne).toHaveBeenCalledWith('rt-123');
      expect(result).toEqual(mockRecurringTransaction);
    });
  });

  describe('update', () => {
    it('should update recurring transaction', async () => {
      const dto = { amount: 6000 };
      service.update.mockResolvedValue({
        ...mockRecurringTransaction,
        amount: 6000,
      } as any);

      const result = await controller.update('rt-123', dto as any);

      expect(service.update).toHaveBeenCalledWith('rt-123', dto);
      expect(result.amount).toBe(6000);
    });
  });

  describe('remove', () => {
    it('should delete recurring transaction', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('rt-123');

      expect(service.remove).toHaveBeenCalledWith('rt-123');
    });
  });
});
