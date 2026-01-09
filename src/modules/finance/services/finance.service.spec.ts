import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Booking } from '../../bookings/entities/booking.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { TransactionFilterDto } from '../dto';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { CurrencyService } from './currency.service';
import { FinanceService } from './finance.service';

import { ExportService } from '../../../common/services/export.service';

import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { DashboardGateway } from '../../dashboard/dashboard.gateway';

describe('FinanceService - Comprehensive Tests', () => {
  let service: FinanceService;

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

  const mockTransaction = {
    id: 'txn-uuid-123',
    type: TransactionType.INCOME,
    amount: 1500.0,
    category: 'Booking Payment',
    bookingId: 'booking-uuid-123',
    description: 'Test transaction',
    transactionDate: new Date(),
    createdAt: new Date(),
  };

  const mockWallet = {
    id: 'wallet-uuid-123',
    userId: 'user-uuid-123',
    pendingBalance: 100.0,
    payableBalance: 200.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransactionRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((txn) =>
        Promise.resolve({ id: 'txn-uuid-123', ...txn }),
      ),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
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
    }),
  };

  const mockWalletRepository = {
    find: jest.fn().mockResolvedValue([mockWallet]),
    findOne: jest.fn(),
  };

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
      save: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: 'wallet-uuid-123', ...data }),
        ),
      queryRunner: {
        isTransactionActive: true,
      },
    },
  };

  const mockBookingRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalTax: '225',
        totalSubTotal: '1500',
        totalGross: '1725',
      }),
    }),
  };

  const mockBudgetRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    }),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest
      .fn()
      .mockImplementation((cb) => cb(mockQueryRunner.manager)),
  };

  const mockCurrencyService = {
    getExchangeRate: jest.fn().mockResolvedValue(1.0),
    convert: jest
      .fn()
      .mockImplementation((amount, _from, _to) => Promise.resolve(amount)),
  };

  const mockTenantsService = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: 'tenant-123', baseCurrency: Currency.USD }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(EmployeeWallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: getRepositoryToken(DepartmentBudget),
          useValue: mockBudgetRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CurrencyService, useValue: mockCurrencyService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: ExportService, useValue: mockExportService },
        { provide: DashboardGateway, useValue: mockDashboardGateway },
        { provide: CacheUtilsService, useValue: mockCacheUtils },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);

    // Reset mocks
    jest.clearAllMocks();

    // Default behavior
    mockTransactionRepository.findOne.mockImplementation(({ where }) => {
      if (where.id === 'txn-uuid-123') return Promise.resolve(mockTransaction);
      return Promise.resolve(null);
    });

    const repoFindOneImpl = (options: any) => {
      const where = options?.where;
      if (where?.userId === 'user-uuid-123')
        return Promise.resolve({ ...mockWallet });
      return Promise.resolve(null);
    };

    const managerFindOneImpl = (_entity: any, options: any) => {
      const where = options?.where;
      if (where?.userId === 'user-uuid-123')
        return Promise.resolve({ ...mockWallet });
      return Promise.resolve(null);
    };

    mockWalletRepository.findOne.mockImplementation(repoFindOneImpl);
    mockQueryRunner.manager.findOne.mockImplementation(managerFindOneImpl);

    jest
      .spyOn(TenantContextService, 'getTenantId')
      .mockReturnValue('tenant-123');
    jest
      .spyOn(TenantContextService, 'getTenantIdOrThrow')
      .mockReturnValue('tenant-123');
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
      await expect(service.createTransaction(dto)).rejects.toThrow(
        'finance.amount_must_be_positive',
      );
    });
  });

  describe('findTransactionById', () => {
    it('should return transaction by valid id', async () => {
      const result = await service.findTransactionById('txn-uuid-123');
      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(service.findTransactionById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============ TRANSACTION QUERY TESTS ============
  describe('findAllTransactions', () => {
    it('should return all transactions without filters', async () => {
      const result = await service.findAllTransactions(
        new TransactionFilterDto(),
      );
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
      mockTransactionRepository
        .createQueryBuilder()
        .getRawMany.mockResolvedValueOnce([]);
      const result = await service.getTransactionSummary();
      expect(result.totalIncome).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.totalPayroll).toBe(0);
      expect(result.netBalance).toBe(0);
    });
  });

  // ============ WALLET CRUD TESTS ============
  describe('getOrCreateWallet', () => {
    it('should return existing wallet', async () => {
      const result = await service.getOrCreateWallet('user-uuid-123');
      expect(result).toEqual(
        expect.objectContaining({ userId: 'user-uuid-123' }),
      );
    });

    it('should create new wallet if not exists', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

      await service.getOrCreateWallet('new-user-uuid');

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        EmployeeWallet,
        expect.objectContaining({
          userId: 'new-user-uuid',
          pendingBalance: 0,
          payableBalance: 0,
          tenantId: 'tenant-123',
        }),
      );
    });
  });

  describe('getWalletByUserId', () => {
    it('should return wallet by user id', async () => {
      const result = await service.getWalletByUserId('user-uuid-123');
      expect(result?.pendingBalance).toBe(100.0);
    });

    it('should return null for non-existent user', async () => {
      mockWalletRepository.findOne.mockResolvedValueOnce(null);
      const result = await service.getWalletByUserId('invalid-user');
      expect(result).toBeNull();
    });
  });

  describe('getAllWallets', () => {
    it('should return all wallets', async () => {
      const result = await service.getAllWallets();
      expect(result).toEqual([mockWallet]);
      expect(mockWalletRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should return empty array when no wallets exist', async () => {
      mockWalletRepository.find.mockResolvedValueOnce([]);
      const result = await service.getAllWallets();
      expect(result).toEqual([]);
    });
  });

  // ============ WALLET OPERATIONS WITH ENTITY MANAGER TESTS ============
  describe('addPendingCommission', () => {
    it('should add commission to pending balance', async () => {
      const walletCopy = {
        ...mockWallet,
        pendingBalance: 100,
        payableBalance: 200,
      };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        create: jest.fn().mockImplementation((Entity, data) => data),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
        queryRunner: { isTransactionActive: true },
      };

      const result = await service.addPendingCommission(
        mockManager as any,
        'user-uuid-123',
        50.0,
      );
      expect(result.pendingBalance).toBe(150); // 100 + 50
      expect(mockManager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('should create wallet if not exists', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((Entity, data) => data),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
        queryRunner: { isTransactionActive: true },
      };

      await service.addPendingCommission(mockManager as any, 'new-user', 50.0);
      expect(mockManager.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if commission amount is zero or negative', async () => {
      const walletCopy = { ...mockWallet, pendingBalance: 100 };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
        queryRunner: { isTransactionActive: true },
      };

      await expect(
        service.addPendingCommission(mockManager as any, 'user-uuid-123', 0),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('moveToPayable', () => {
    it('should move amount from pending to payable', async () => {
      const walletCopy = {
        ...mockWallet,
        pendingBalance: 100,
        payableBalance: 200,
      };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
        queryRunner: { isTransactionActive: true },
      };

      const result = await service.moveToPayable(
        mockManager as any,
        'user-uuid-123',
        50.0,
      );
      expect(result.payableBalance).toBe(250); // 200 + 50
      expect(mockManager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('should throw error when wallet not found', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        queryRunner: { isTransactionActive: true },
      };

      await expect(
        service.moveToPayable(mockManager as any, 'invalid-user', 50.0),
      ).rejects.toThrow('Wallet not found');
    });

    it('should throw BadRequestException when transfer exceeds pending balance', async () => {
      const walletCopy = {
        ...mockWallet,
        pendingBalance: 30, // Only 30 available
        payableBalance: 200,
      };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        queryRunner: { isTransactionActive: true },
      };

      // Trying to transfer 50 when only 30 is available
      await expect(
        service.moveToPayable(mockManager as any, 'user-uuid-123', 50.0),
      ).rejects.toThrow('Insufficient pending balance');
    });
  });

  describe('resetPayableBalance', () => {
    it('should reset payable balance to zero', async () => {
      const walletCopy = {
        ...mockWallet,
        pendingBalance: 100,
        payableBalance: 200,
      };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
        queryRunner: { isTransactionActive: true },
      };

      const result = await service.resetPayableBalance(
        mockManager as any,
        'user-uuid-123',
      );
      expect(result.payableBalance).toBe(0);
      expect(result.pendingBalance).toBe(100); // Pending should remain unchanged
    });

    it('should throw error when wallet not found', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        queryRunner: { isTransactionActive: true },
      };

      await expect(
        service.resetPayableBalance(mockManager as any, 'invalid-user'),
      ).rejects.toThrow('Wallet not found');
    });
  });

  // ============ TRANSACTION WITH MANAGER TESTS ============
  describe('createTransactionWithManager', () => {
    it('should create transaction using entity manager', async () => {
      const mockManager = {
        create: jest.fn().mockImplementation((Entity, data) => data),
        save: jest
          .fn()
          .mockImplementation((txn) =>
            Promise.resolve({ id: 'txn-new', ...txn }),
          ),
      };

      const dto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        category: 'Booking Payment',
        transactionDate: new Date(),
      };

      await service.createTransactionWithManager(mockManager as any, dto);
      expect(mockManager.create).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('should include reference in transaction', async () => {
      const mockManager = {
        create: jest.fn().mockImplementation((Entity, data) => data),
        save: jest
          .fn()
          .mockImplementation((txn) =>
            Promise.resolve({ id: 'txn-new', ...txn }),
          ),
      };

      const dto = {
        type: TransactionType.INCOME,
        amount: 1500.0,
        category: 'Booking Payment',
        bookingId: 'booking-123',
        transactionDate: new Date(),
      };

      const result = await service.createTransactionWithManager(
        mockManager as any,
        dto,
      );
      expect(result.bookingId).toBe('booking-123');
    });
  });

  describe('budgets', () => {
    const mockBudget = {
      id: 'budget-uuid-123',
      department: 'Photography',
      budgetAmount: 5000,
      period: '2024-01',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should upsert a budget', async () => {
      mockBudgetRepository.findOne.mockResolvedValue(null);
      mockBudgetRepository.create.mockReturnValue(mockBudget);
      mockBudgetRepository.save.mockResolvedValue(mockBudget);

      const result = await service.upsertBudget({
        department: 'Photography',
        budgetAmount: 5000,
        period: '2024-01',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result).toEqual(mockBudget);
      expect(mockBudgetRepository.save).toHaveBeenCalled();
    });

    it('should return budget report with actual spending', async () => {
      mockBudgetRepository.find.mockResolvedValue([mockBudget]);
      mockTransactionRepository
        .createQueryBuilder()
        .getRawMany.mockResolvedValue([
          { department: 'Photography', total: '1500' },
        ]);

      const report = await service.getBudgetReport('2024-01');

      expect(report).toHaveLength(1);
      expect(report[0].actualSpent).toBe(1500);
      expect(report[0].variance).toBe(3500);
      expect(report[0].utilizationPercentage).toBe(30);
    });

    it('should handle zero utilization', async () => {
      mockBudgetRepository.find.mockResolvedValue([mockBudget]);
      mockTransactionRepository
        .createQueryBuilder()
        .getRawMany.mockResolvedValue([
          { department: 'Photography', total: '0' },
        ]);

      const report = await service.getBudgetReport('2024-01');

      expect(report[0].utilizationPercentage).toBe(0);
    });
  });

  describe('exportTransactionsToCSV', () => {
    it('should stream transactions to response', async () => {
      const mockRes = {} as any;
      await service.exportTransactionsToCSV(mockRes);
      expect(mockTransactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        't',
      );
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
