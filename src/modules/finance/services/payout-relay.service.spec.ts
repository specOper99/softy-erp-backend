import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MockPaymentGatewayService } from '../../hr/services/payment-gateway.service';
import { Payout } from '../entities/payout.entity';
import { PayoutStatus } from '../enums/payout-status.enum';
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
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
    },
  };

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([{ locked: true }]),
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  const mockDistributedLockService = {
    withLock: jest.fn().mockImplementation(async (_key: string, callback: () => Promise<unknown>) => {
      return callback();
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutRelayService,
        {
          provide: getRepositoryToken(Payout),
          useValue: mockPayoutRepository,
        },
        { provide: MockPaymentGatewayService, useValue: mockPaymentGatewayService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: FinanceService, useValue: mockFinanceService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DistributedLockService, useValue: mockDistributedLockService },
      ],
    }).compile();

    service = module.get<PayoutRelayService>(PayoutRelayService);

    jest.clearAllMocks();
    jest.spyOn(TenantContextService, 'run').mockImplementation((_, cb) => {
      return cb();
    });
  });

  describe('processPendingPayouts', () => {
    it('should process pending payouts successfully', async () => {
      await service.processPendingPayouts();

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

      // Verify gateway was attempted
      expect(mockPaymentGatewayService.triggerPayout).toHaveBeenCalled();
    });

    it('should fail if metadata is missing', async () => {
      mockPayoutRepository.find.mockResolvedValueOnce([{ ...mockPayout, metadata: null }]);

      await service.processPendingPayouts();

      // Should not attempt gateway trigger if metadata is missing
      expect(mockPaymentGatewayService.triggerPayout).not.toHaveBeenCalled();
    });
  });
});
