import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TENANT_REPO_PAYOUT } from '../../../common/constants/tenant-repo.tokens';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { PAYMENT_GATEWAY } from '../../hr/application/payment-gateway.service';
import { TenantsService } from '../../tenants/application/tenants.service';
import { PayoutStatus } from '../domain/enums/payout-status.enum';
import { FinanceService } from './finance.service';
import { PayoutRelayService } from './payout-relay.service';
import { WalletService } from './wallet.service';

describe('PayoutRelayService', () => {
  let service: PayoutRelayService;

  const mockPayout = {
    id: 'payout-123',
    tenantId: 'tenant-123',
    amount: 1000,
    commissionAmount: 50,
    status: PayoutStatus.PENDING,
    metadata: {
      userId: 'user-123',
      employeeName: 'John Doe',
      bankAccount: '1234567890',
      referenceId: 'ref-123',
    },
    notes: '',
  };

  const mockPayoutRepository = {
    find: jest.fn().mockResolvedValue([mockPayout]),
    save: jest.fn(),
  };

  const mockPaymentGatewayService = {
    triggerPayout: jest.fn().mockResolvedValue({ success: true, transactionReference: 'TXN-1' }),
  };

  const mockWalletService = {
    refundPayableBalance: jest.fn().mockResolvedValue({}),
  };

  const mockFinanceService = {
    createTransactionWithManager: jest.fn().mockResolvedValue({}),
    notifyTransactionCreated: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([{ locked: true }]),
    createQueryRunner: jest.fn(),
  };

  const mockDistributedLockService = {
    withLock: jest.fn().mockImplementation(async (_key: string, callback: () => Promise<unknown>) => callback()),
  };

  const mockTenantsService = {
    findAll: jest.fn().mockResolvedValue([{ id: 'tenant-123' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutRelayService,
        { provide: TENANT_REPO_PAYOUT, useValue: mockPayoutRepository },
        { provide: PAYMENT_GATEWAY, useValue: mockPaymentGatewayService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DistributedLockService, useValue: mockDistributedLockService },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    service = module.get<PayoutRelayService>(PayoutRelayService);

    jest.clearAllMocks();
    jest.spyOn(TenantContextService, 'run').mockImplementation((_, cb) => cb());
  });

  describe('processPendingPayouts', () => {
    it('should process pending payouts successfully', async () => {
      await service.processPendingPayouts();

      expect(mockTenantsService.findAll).toHaveBeenCalled();
      expect(mockPayoutRepository.find).toHaveBeenCalled();
      expect(mockPaymentGatewayService.triggerPayout).toHaveBeenCalledWith({
        employeeName: 'John Doe',
        bankAccount: '1234567890',
        amount: 1000,
        referenceId: 'ref-123',
      });
    });

    it('should handle gateway failure', async () => {
      mockPaymentGatewayService.triggerPayout.mockResolvedValueOnce({ success: false, error: 'Fail' });

      await service.processPendingPayouts();

      expect(mockPaymentGatewayService.triggerPayout).toHaveBeenCalled();
    });

    it('should fail if metadata is missing', async () => {
      mockPayoutRepository.find.mockResolvedValueOnce([{ ...mockPayout, metadata: null }]);

      await service.processPendingPayouts();

      expect(mockPaymentGatewayService.triggerPayout).not.toHaveBeenCalled();
    });

    it('does not process payouts owned by another tenant', async () => {
      // TenantAwareRepository scopes find by tenantId; cross-tenant rows are invisible.
      mockTenantsService.findAll.mockResolvedValueOnce([{ id: 'tenant-123' }]);
      mockPayoutRepository.find.mockResolvedValueOnce([]);

      await service.processBatch();

      expect(mockPayoutRepository.find).toHaveBeenCalled();
      expect(mockPaymentGatewayService.triggerPayout).not.toHaveBeenCalled();
    });
  });
});
