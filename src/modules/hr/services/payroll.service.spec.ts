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
import { PayrollRunRepository } from '../repositories/payroll-run.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { PayrollService } from './payroll.service';

jest.mock('p-limit'); // Use the manual mock in __mocks__/p-limit.ts

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
          provide: ProfileRepository,
          useValue: mockProfileRepository,
        },
        {
          provide: PayrollRunRepository,
          useValue: mockPayrollRunRepository,
        },
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

    it('should consume payable commissions for multiple assignees and reset each wallet after payout', async () => {
      const profileA = {
        ...mockProfile,
        id: 'profile-a',
        userId: 'assignee-user-a',
        baseSalary: 2000,
        firstName: 'Alice',
        lastName: 'Lead',
      };
      const profileB = {
        ...mockProfile,
        id: 'profile-b',
        userId: 'assignee-user-b',
        baseSalary: 1800,
        firstName: 'Bob',
        lastName: 'Assist',
      };

      mockProfileRepository.count.mockResolvedValueOnce(2);
      mockProfileRepository.find.mockResolvedValueOnce([profileA, profileB]);
      mockWalletService.getOrCreateWalletWithManager
        .mockResolvedValueOnce({ payableBalance: 70 })
        .mockResolvedValueOnce({ payableBalance: 30 });

      const result = await service.runPayroll();

      expect(mockWalletService.getOrCreateWalletWithManager).toHaveBeenNthCalledWith(
        1,
        mockQueryRunner.manager,
        'assignee-user-a',
      );
      expect(mockWalletService.getOrCreateWalletWithManager).toHaveBeenNthCalledWith(
        2,
        mockQueryRunner.manager,
        'assignee-user-b',
      );
      expect(mockWalletService.resetPayableBalance).toHaveBeenCalledTimes(2);
      expect(mockWalletService.resetPayableBalance).toHaveBeenNthCalledWith(
        1,
        mockQueryRunner.manager,
        'assignee-user-a',
      );
      expect(mockWalletService.resetPayableBalance).toHaveBeenNthCalledWith(
        2,
        mockQueryRunner.manager,
        'assignee-user-b',
      );

      const payoutSaves = mockQueryRunner.manager.save.mock.calls
        .map((call) => call[0])
        .filter((entity) => entity?.status === 'PENDING');
      expect(payoutSaves).toHaveLength(2);
      expect(payoutSaves[0]).toEqual(
        expect.objectContaining({
          amount: 2070,
          commissionAmount: 70,
          metadata: expect.objectContaining({ userId: 'assignee-user-a' }),
        }),
      );
      expect(payoutSaves[1]).toEqual(
        expect.objectContaining({
          amount: 1830,
          commissionAmount: 30,
          metadata: expect.objectContaining({ userId: 'assignee-user-b' }),
        }),
      );

      expect(result.totalPayout).toBe(3900);
      expect(result.totalEmployees).toBe(2);
    });

    it('should consume payable commissions via legacy assigned-user payout flow when no task-assignee context exists', async () => {
      const legacyProfile = {
        ...mockProfile,
        id: 'legacy-profile',
        userId: 'legacy-user',
        baseSalary: 1000,
        firstName: 'Legacy',
        lastName: 'Staff',
      };

      mockProfileRepository.count.mockResolvedValueOnce(1);
      mockProfileRepository.find.mockResolvedValueOnce([legacyProfile]);
      mockWalletService.getOrCreateWalletWithManager.mockResolvedValueOnce({ payableBalance: 120 });

      const result = await service.runPayroll();

      expect(mockWalletService.getOrCreateWalletWithManager).toHaveBeenCalledWith(
        mockQueryRunner.manager,
        'legacy-user',
      );
      expect(mockWalletService.resetPayableBalance).toHaveBeenCalledWith(mockQueryRunner.manager, 'legacy-user');

      const payoutSaves = mockQueryRunner.manager.save.mock.calls
        .map((call) => call[0])
        .filter((entity) => entity?.status === 'PENDING');
      expect(payoutSaves[0]).toEqual(
        expect.objectContaining({
          amount: 1120,
          commissionAmount: 120,
          metadata: expect.objectContaining({ userId: 'legacy-user' }),
        }),
      );

      expect(result.totalPayout).toBe(1120);
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

    it('should fail payroll run and persist failed run status after batch failure', async () => {
      mockQueryRunner.manager.save.mockRejectedValueOnce(new Error('Fail DB'));

      await expect(service.runPayroll()).rejects.toThrow('hr.payroll_failed');
      expect(mockPayrollRunRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED',
        }),
      );
      expect(mockPayrollRunRepository.save).toHaveBeenCalled();
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
