import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  createMockRepository,
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
import { CurrencyService } from './currency.service';
import { FinanceService } from './finance.service';
import { FinancialReportService } from './financial-report.service';

import { ExportService } from '../../../common/services/export.service';

import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';

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

  const mockDashboardGateway = {
    server: {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    },
    broadcastMetricsUpdate: jest.fn(),
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

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager: {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entity, data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'wallet-uuid-123', ...data })),
      queryRunner: {
        isTransactionActive: true,
      },
    },
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
          provide: getRepositoryToken(Transaction),
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
        { provide: DashboardGateway, useValue: mockDashboardGateway },
        { provide: CacheUtilsService, useValue: mockCacheUtils },
        {
          provide: FinancialReportService,
          useValue: mockFinancialReportService,
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
      const mockRes = {} as any;
      await service.exportTransactionsToCSV(mockRes);
      expect(mockTransactionRepository.createQueryBuilder).toHaveBeenCalledWith('t');
      expect(mockExportService.streamFromStream).toHaveBeenCalledWith(
        mockRes,
        expect.anything(),
        expect.stringContaining('transactions-export-'),
        expect.any(Array),
        expect.any(Function),
      );
    });
  });
});
