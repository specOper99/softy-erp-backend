import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRun, Profile } from '../entities';
import { PayrollService } from './payroll.service';

// Mock p-limit - it's a default export that returns a limiter function
jest.mock('p-limit', () => jest.fn(() => (fn: () => Promise<unknown>) => fn()));

describe('PayrollService', () => {
  let service: PayrollService;

  const mockProfile = {
    id: 'profile-uuid-123',
    userId: 'user-uuid-123',
    firstName: 'John',
    lastName: 'Doe',
    baseSalary: 2000,
    bankAccount: '1234567890',
    user: {
      id: 'user-uuid-123',
      email: 'john@example.com',
      wallet: {
        payableBalance: 150,
      },
    },
  };

  const mockProfileRepository = {
    find: jest.fn().mockResolvedValue([mockProfile]),
    count: jest.fn().mockResolvedValue(1),
  };

  const mockPayrollRunRepository = {
    create: jest.fn().mockImplementation((data) => ({ id: 'run-uuid-123', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    find: jest.fn().mockResolvedValue([]),
  };

  const mockFinanceService = {
    createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'txn-uuid-123' }),
  };

  const mockWalletService = {
    getOrCreateWalletWithManager: jest.fn().mockResolvedValue({ payableBalance: 150 }),
    resetPayableBalance: jest.fn().mockResolvedValue({ payableBalance: 0 }),
  };

  const mockMailService = {
    sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      find: jest.fn().mockResolvedValue([mockProfile]),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'payout-123', ...data })),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_, data) => ({ id: 'payout-123', ...data })),
      decrement: jest.fn(),
      increment: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    query: jest.fn().mockResolvedValue([{ locked: true }]),
    manager: {},
    getRepository: jest.fn().mockImplementation((_entity) => {
      return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    }),
  };

  const mockTenantsService = {
    findAll: jest.fn().mockResolvedValue([{ id: 'test-tenant-id', slug: 'test-tenant' }]),
  };

  const mockDistributedLockService = {
    acquire: jest.fn(),
    release: jest.fn(),
    acquireWithRetry: jest.fn(),
    withLock: jest.fn().mockImplementation((_resource, fn) => fn()),
    isLocked: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: getRepositoryToken(Profile),
          useValue: mockProfileRepository,
        },
        {
          provide: getRepositoryToken(PayrollRun),
          useValue: mockPayrollRunRepository,
        },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuditPublisher, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: DistributedLockService, useValue: mockDistributedLockService },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);

    jest.clearAllMocks();
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('test-tenant-id');
  });

  describe('runPayroll', () => {
    it('should calculate payroll and create pending payout', async () => {
      const result = await service.runPayroll();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      // Should save Payout
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
          amount: 2150,
        }),
      );
      // Should NOT create transaction (deferred to relay)
      expect(mockFinanceService.createTransactionWithManager).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result.totalPayout).toBe(2150);
      expect(result.totalEmployees).toBe(1);
    });

    it('should skip employees with zero payout', async () => {
      mockProfileRepository.find.mockResolvedValueOnce([
        {
          ...mockProfile,
          baseSalary: 0,
          user: { wallet: { payableBalance: 0 } },
        },
      ]);
      mockWalletService.getOrCreateWalletWithManager.mockResolvedValueOnce({ payableBalance: 0 });
      await service.runPayroll();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('should rollback on failure', async () => {
      // We simulate failure during save or wallet processing
      mockQueryRunner.manager.save.mockRejectedValueOnce(new Error('Fail DB'));
      await service.runPayroll();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('runScheduledPayroll', () => {
    it('should call runPayroll', async () => {
      const runPayrollSpy = jest.spyOn(service, 'runPayroll').mockResolvedValue({
        totalEmployees: 1,
        totalPayout: 100,
        transactionIds: [],
        processedAt: new Date(),
      });
      // Mock TenantContextService.run
      jest.spyOn(TenantContextService, 'run').mockImplementation((_, cb) => {
        cb();
        return Promise.resolve();
      });

      await service.runScheduledPayroll();
      expect(runPayrollSpy).toHaveBeenCalled();
    });
  });

  describe('getPayrollHistory', () => {
    it('should return payroll run history', async () => {
      const mockRuns = [{ id: 'run-1', totalPayout: 1000 }];
      mockPayrollRunRepository.find.mockResolvedValueOnce(mockRuns);
      const result = await service.getPayrollHistory();
      expect(result).toEqual(mockRuns);
    });
  });
});
