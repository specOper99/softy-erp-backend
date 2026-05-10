import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { createMockTransaction } from '../../../../test/helpers/mock-factories';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import type { CreateTransactionDto } from '../dto';
import { TransactionFilterDto } from '../dto';
import type { TransactionCursorQueryDto } from '../dto/finance.dto';
import { TransactionType } from '../enums/transaction-type.enum';
import { FinanceService } from '../services/finance.service';
import { FinancialReportService } from '../services/financial-report.service';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: FinanceService;

  const mockTransaction = createMockTransaction({
    id: 'uuid',
    amount: 100,
    type: TransactionType.INCOME,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: FinanceService,
          useValue: {
            findAllTransactions: jest.fn().mockResolvedValue([mockTransaction]),
            findAllTransactionsCursor: jest.fn().mockResolvedValue({ data: [mockTransaction], nextCursor: null }),
            findTransactionById: jest.fn().mockResolvedValue(mockTransaction),
            createTransaction: jest.fn().mockResolvedValue(mockTransaction),
            getTransactionSummary: jest.fn().mockResolvedValue({ totalIncome: 1000 }),
          },
        },
        {
          provide: FinancialReportService,
          useValue: {
            upsertBudget: jest.fn().mockResolvedValue({}),
            getBudgetReport: jest.fn().mockResolvedValue({}),
            invalidateReportCaches: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get<FinanceService>(FinanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAllTransactions', async () => {
      const filter = new TransactionFilterDto();
      await controller.findAll(filter);
      expect(service.findAllTransactions).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllCursor', () => {
    it('should call service.findAllTransactionsCursor', async () => {
      const query: TransactionCursorQueryDto = { cursor: 'cursor-1', limit: 10, bookingId: 'booking-uuid-123' };
      await controller.findAllCursor(query);
      expect(service.findAllTransactionsCursor).toHaveBeenCalledWith(query);
    });
  });

  describe('getSummary', () => {
    it('should call service.getTransactionSummary', async () => {
      await controller.getSummary();
      expect(service.getTransactionSummary).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findTransactionById', async () => {
      await controller.findOne('uuid');
      expect(service.findTransactionById).toHaveBeenCalledWith('uuid');
    });
  });

  describe('create', () => {
    it('should call service.createTransaction', async () => {
      const dto = { amount: 50, type: TransactionType.EXPENSE } as CreateTransactionDto;
      await controller.create(dto);
      expect(service.createTransaction).toHaveBeenCalledWith(dto);
    });
  });
});
