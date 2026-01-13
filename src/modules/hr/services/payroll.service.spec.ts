import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { Payout } from '../../finance/entities/payout.entity';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRun, Profile } from '../entities';
import { MockPaymentGatewayService } from './payment-gateway.service';
import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  let service: PayrollService;

  const mockProfile = {
    id: 'profile-uuid-123',
    userId: 'user-uuid-123',
    firstName: 'John',
    lastName: 'Doe',
    baseSalary: 2000.0,
    bankAccount: '1234567890',
    user: {
      id: 'user-uuid-123',
      email: 'john@example.com',
      wallet: {
        payableBalance: 150.0,
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
    resetPayableBalance: jest.fn().mockResolvedValue({ payableBalance: 0 }),
  };

  const mockMailService = {
    sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockPayoutRepository = {
    create: jest.fn().mockImplementation((data) => ({ id: 'payout-uuid-123', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'payout-uuid-123', ...data })),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      find: jest.fn().mockResolvedValue([mockProfile]),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    query: jest.fn().mockResolvedValue([{ locked: true }]),
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === Payout) return mockPayoutRepository;
      return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    }),
  };

  const mockTenantsService = {
    findAll: jest.fn().mockResolvedValue([{ id: 'test-tenant-id', slug: 'test-tenant' }]),
  };

  const mockPaymentGatewayService = {
    triggerPayout: jest.fn().mockResolvedValue({ success: true, transactionReference: 'REF-123' }),
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
        {
          provide: MockPaymentGatewayService,
          useValue: mockPaymentGatewayService,
        },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);

    jest.clearAllMocks();
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue('test-tenant-id');
  });

  describe('runPayroll', () => {
    it('should calculate payroll and create transactions', async () => {
      const result = await service.runPayroll();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockFinanceService.createTransactionWithManager).toHaveBeenCalled();
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
      await service.runPayroll();
      expect(mockFinanceService.createTransactionWithManager).not.toHaveBeenCalled();
    });

    it('should rollback on failure', async () => {
      mockFinanceService.createTransactionWithManager.mockRejectedValueOnce(new Error('Fail'));
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
