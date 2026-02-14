import { NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  createMockQueryRunner,
  createMockRepository,
  createMockResponse,
  createMockTransaction,
  MockRepository,
  mockTenantContext,
} from '../../../../test/helpers/mock-factories';
import { Booking } from '../../bookings/entities/booking.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { TransactionFilterDto } from '../dto';
import { Transaction } from '../entities/transaction.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CurrencyService } from './currency.service';
import { FinanceService } from './finance.service';
import { FinancialReportService } from './financial-report.service';
import { WalletService } from './wallet.service';

import { ExportService } from '../../../common/services/export.service';

import { CacheUtilsService } from '../../../common/cache/cache-utils.service';

describe('FinanceService - Comprehensive Tests', () => {
  let service: FinanceService;

  let mockTransactionRepository: MockRepository<Transaction>;
  let mockBookingRepository: MockRepository<Booking>;

  const mockCacheUtils = {
    clearCache: jest.fn(),
    del: jest.fn(),
  };

  const mockExportService = {
    exportTransactions: jest.fn().mockResolvedValue('mock-csv'),
    exportInvoices: jest.fn().mockResolvedValue('mock-csv'),
    streamFromStream: jest.fn(),
  };

  const mockFinancialReportService = {
    invalidateReportCaches: jest.fn(),
  };

  const mockTransaction = createMockTransaction({
    type: TransactionType.INCOME,
    amount: 1500.0,
    category: 'Booking Payment',
    bookingId: 'booking-uuid-123',
    description: 'Test transaction',
  }) as unknown as Transaction;

  const mockQueryRunner = createMockQueryRunner();
  // Override save to match specific test behavior for wallet
  mockQueryRunner.manager.save.mockImplementation((data) => Promise.resolve({ id: 'wallet-uuid-123', ...data }));

  const mockWalletService = {
    addPendingCommission: jest.fn().mockResolvedValue(undefined),
    subtractPendingCommission: jest.fn().mockResolvedValue(undefined),
  };

  const mockEventBus = {
    publish: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest.fn().mockImplementation((cb) => cb(mockQueryRunner.manager)),
  };

  const mockCurrencyService = {
    getExchangeRate: jest.fn().mockResolvedValue(1.0),
    convert: jest.fn().mockImplementation((amount, _from, _to) => Promise.resolve(amount)),
  };

  const mockTenantsService = {
    findOne: jest.fn().mockResolvedValue({ id: 'tenant-123', baseCurrency: Currency.USD }),
  };

  beforeEach(async () => {
    mockTransactionRepository = createMockRepository();

    // Configure complex QueryBuilder mock for Transaction Repository
    mockTransactionRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockTransaction]),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { type: TransactionType.INCOME, total: '5000' },
        { type: TransactionType.EXPENSE, total: '2000' },
        { type: TransactionType.PAYROLL, total: '1000' },
      ]),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      stream: jest.fn().mockResolvedValue({
        pipe: jest.fn(),
        on: jest.fn(),
      }),
    });

    // Mock createStreamQueryBuilder for streaming exports
    (mockTransactionRepository as unknown as { createStreamQueryBuilder: jest.Mock }).createStreamQueryBuilder = jest
      .fn()
      .mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        stream: jest.fn().mockResolvedValue({
          pipe: jest.fn(),
          on: jest.fn((event, callback) => {
            if (event === 'end') callback();
            return { pipe: jest.fn(), on: jest.fn() };
          }),
        }),
      });

    // Configure other default behaviors
    mockTransactionRepository.save.mockImplementation((txn: any) =>
      Promise.resolve({ id: 'txn-uuid-123', ...txn } as unknown as Transaction),
    );

    mockBookingRepository = createMockRepository();
    mockBookingRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalTax: '225',
        totalSubTotal: '1500',
        totalGross: '1725',
      }),
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: TransactionRepository,
          useValue: mockTransactionRepository,
        },
        // {
        //   provide: getRepositoryToken(EmployeeWallet),
        //   useValue: mockWalletRepository,
        // },
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        // {
        //   provide: getRepositoryToken(DepartmentBudget),
        //   useValue: mockBudgetRepository,
        // },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CurrencyService, useValue: mockCurrencyService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: ExportService, useValue: mockExportService },
        { provide: CacheUtilsService, useValue: mockCacheUtils },
        {
          provide: FinancialReportService,
          useValue: mockFinancialReportService,
        },
        { provide: WalletService, useValue: mockWalletService },
        {
          provide: EventBus,
          useValue: mockEventBus,
        },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);

    // Reset mocks
    jest.clearAllMocks();

    // Default behavior
    mockTransactionRepository.findOne.mockImplementation(({ where }: any) => {
      if (where?.id === 'txn-uuid-123') return Promise.resolve(mockTransaction);
      return Promise.resolve(null);
    });

    // Mock queryRunner manager findOne
    const managerFindOneImpl = (_entity: any, _options: any) => {
      return Promise.resolve(null);
    };

    mockQueryRunner.manager.findOne.mockImplementation(managerFindOneImpl);

    mockTenantContext('tenant-123');
  });

  // ============ TRANSACTION CRUD TESTS ============
  describe('createTransaction', () => {
    it('should create INCOME transaction', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        category: 'Booking Payment',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result).toHaveProperty('id');
      expect(result.type).toBe(TransactionType.INCOME);
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should reject amounts with more than 2 decimal places (exponential notation)', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 1e-7,
        category: 'Booking Payment',
        transactionDate: '2024-12-31T00:00:00Z',
      };

      await expect(service.createTransaction(dto)).rejects.toThrow('finance.amount_precision_error');
    });

    it('should accept valid exponential notation amount within precision', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 1e-2,
        category: 'Booking Payment',
        transactionDate: '2024-12-31T00:00:00Z',
      };

      const result = await service.createTransaction(dto);
      expect(result).toHaveProperty('id');
    });

    it('should reject unsupported currency values', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 100,
        currency: 'IQD' as unknown as Currency,
        category: 'Booking Payment',
        transactionDate: '2024-12-31T00:00:00Z',
      };

      await expect(service.createTransaction(dto)).rejects.toThrow('finance.unsupported_currency');
    });

    it('should create EXPENSE transaction', async () => {
      const dto = {
        type: TransactionType.EXPENSE,
        amount: 500.0,
        category: 'Equipment',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result).toHaveProperty('id');
    });

    it('should create PAYROLL transaction', async () => {
      const dto = {
        type: TransactionType.PAYROLL,
        amount: 2000.0,
        category: 'Monthly Payroll',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result).toHaveProperty('id');
    });

    it('should create transaction with reference', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        category: 'Booking Payment',
        bookingId: 'booking-uuid-123',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result.bookingId).toBe('booking-uuid-123');
    });

    it('should create transaction with description', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        category: 'Booking Payment',
        description: 'Wedding booking payment',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result.description).toBe('Wedding booking payment');
    });

    it('should reject zero amount transaction', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 0,
        category: 'Test',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      await expect(service.createTransaction(dto)).rejects.toThrow('finance.amount_must_be_positive');
    });
  });

  describe('createTransactionWithManager', () => {
    it('should publish transaction created event', async () => {
      const manager = mockQueryRunner.manager as unknown as EntityManager;

      await service.createTransactionWithManager(manager, {
        type: TransactionType.EXPENSE,
        amount: 250,
        category: 'Supplies',
        transactionDate: new Date('2025-01-01T00:00:00.000Z'),
      });

      expect(mockEventBus.publish).toHaveBeenCalled();
    });
  });

  describe('findTransactionById', () => {
    it('should return transaction by valid id', async () => {
      const result = await service.findTransactionById('txn-uuid-123');
      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findTransactionById('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ TRANSACTION QUERY TESTS ============
  describe('findAllTransactions', () => {
    it('should return all transactions without filters', async () => {
      const result = await service.findAllTransactions(new TransactionFilterDto());
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by transaction type', async () => {
      const filter = new TransactionFilterDto();
      filter.type = TransactionType.INCOME;
      await service.findAllTransactions(filter);
      expect(mockTransactionRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      const filter = new TransactionFilterDto();
      filter.startDate = '2024-01-01';
      filter.endDate = '2024-12-31';
      await service.findAllTransactions(filter);
      expect(mockTransactionRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getTransactionSummary', () => {
    it('should return correct financial summary', async () => {
      const result = await service.getTransactionSummary();
      expect(result.totalIncome).toBe(5000);
      expect(result.totalExpenses).toBe(2000);
      expect(result.totalPayroll).toBe(1000);
      expect(result.netBalance).toBe(2000); // 5000 - 2000 - 1000
    });

    it('should handle zero balances', async () => {
      mockTransactionRepository.createQueryBuilder().getRawMany.mockResolvedValueOnce([]);
      const result = await service.getTransactionSummary();
      expect(result.totalIncome).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.totalPayroll).toBe(0);
      expect(result.netBalance).toBe(0);
    });
  });

  // ============ WALLET AND BUDGET TESTS REMOVED (Moved to separate services) ============

  describe('exportTransactionsToCSV', () => {
    it('should stream transactions to response', async () => {
      const mockRes = createMockResponse();
      await service.exportTransactionsToCSV(mockRes);
      expect(
        (mockTransactionRepository as unknown as { createStreamQueryBuilder: jest.Mock }).createStreamQueryBuilder,
      ).toHaveBeenCalledWith('t');
      expect(mockExportService.streamFromStream).toHaveBeenCalledWith(
        mockRes,
        expect.anything(),
        expect.stringContaining('transactions-export-'),
        expect.any(Array),
        expect.any(Function),
      );
    });
  });

  describe('transferPendingCommission', () => {
    it('calls WalletService methods in deterministic order', async () => {
      // oldUserId = 'b', newUserId = 'a' -> sorted order: 'a' (add), 'b' (subtract)
      await service.transferPendingCommission(mockQueryRunner.manager as unknown as EntityManager, 'b', 'a', 100);
      expect(mockWalletService.addPendingCommission).toHaveBeenCalledWith(mockQueryRunner.manager, 'a', 100);
      expect(mockWalletService.subtractPendingCommission).toHaveBeenCalledWith(mockQueryRunner.manager, 'b', 100);
      // And ensure ordering: add called before subtract
      const addIndex = mockWalletService.addPendingCommission.mock.invocationCallOrder[0];
      const subIndex = mockWalletService.subtractPendingCommission.mock.invocationCallOrder[0];
      expect(addIndex!).toBeLessThan(subIndex!);
    });
  });
});
