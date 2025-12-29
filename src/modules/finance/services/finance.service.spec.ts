import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReferenceType, TransactionType } from '../../../common/enums';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { FinanceService } from './finance.service';

describe('FinanceService - Comprehensive Tests', () => {
  let service: FinanceService;

  const mockTransaction = {
    id: 'txn-uuid-123',
    type: TransactionType.INCOME,
    amount: 1500.0,
    category: 'Booking Payment',
    referenceId: 'booking-uuid-123',
    referenceType: ReferenceType.BOOKING,
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
      getMany: jest.fn().mockResolvedValue([mockTransaction]),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { type: TransactionType.INCOME, total: '5000' },
        { type: TransactionType.EXPENSE, total: '2000' },
        { type: TransactionType.PAYROLL, total: '1000' },
      ]),
    }),
  };

  const mockWalletRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([mockWallet]),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(),
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
        { provide: DataSource, useValue: mockDataSource },
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

    mockWalletRepository.findOne.mockImplementation(({ where }) => {
      if (where.userId === 'user-uuid-123')
        return Promise.resolve({ ...mockWallet });
      return Promise.resolve(null);
    });

    jest
      .spyOn(TenantContextService, 'getTenantId')
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
        referenceId: 'booking-uuid-123',
        referenceType: ReferenceType.BOOKING,
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result.referenceId).toBe('booking-uuid-123');
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

    it('should handle zero amount transaction', async () => {
      const dto = {
        type: TransactionType.INCOME,
        amount: 0,
        category: 'Test',
        transactionDate: '2024-12-31T00:00:00Z',
      };
      const result = await service.createTransaction(dto);
      expect(result.amount).toBe(0);
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
      const result = await service.findAllTransactions({});
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by transaction type', async () => {
      await service.findAllTransactions({
        type: TransactionType.INCOME,
      });
      expect(mockTransactionRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      await service.findAllTransactions({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
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
      mockWalletRepository.findOne.mockResolvedValueOnce(null);

      await service.getOrCreateWallet('new-user-uuid');

      expect(mockWalletRepository.create).toHaveBeenCalledWith({
        userId: 'new-user-uuid',
        pendingBalance: 0,
        payableBalance: 0,
        tenantId: 'tenant-123',
      });
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
      };

      const result = await service.addPendingCommission(
        mockManager as any,
        'user-uuid-123',
        50.0,
      );
      expect(result.pendingBalance).toBe(150); // 100 + 50
    });

    it('should create wallet if not exists', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((Entity, data) => data),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      };

      await service.addPendingCommission(mockManager as any, 'new-user', 50.0);
      expect(mockManager.create).toHaveBeenCalled();
    });

    it('should handle zero commission', async () => {
      const walletCopy = { ...mockWallet, pendingBalance: 100 };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(walletCopy),
        save: jest.fn().mockImplementation((wallet) => Promise.resolve(wallet)),
      };

      const result = await service.addPendingCommission(
        mockManager as any,
        'user-uuid-123',
        0,
      );
      expect(result.pendingBalance).toBe(100);
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
      };

      const result = await service.moveToPayable(
        mockManager as any,
        'user-uuid-123',
        50.0,
      );
      expect(result.pendingBalance).toBe(50); // 100 - 50
      expect(result.payableBalance).toBe(250); // 200 + 50
    });

    it('should throw error when wallet not found', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
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
        referenceId: 'booking-123',
        referenceType: ReferenceType.BOOKING,
        transactionDate: new Date(),
      };

      const result = await service.createTransactionWithManager(
        mockManager as any,
        dto,
      );
      expect(result.referenceId).toBe('booking-123');
    });
  });
});
