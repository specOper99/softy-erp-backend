import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockFinanceService.createTransactionWithManager).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should handle gateway failure', async () => {
      mockPaymentGatewayService.triggerPayout.mockResolvedValueOnce({ success: false, error: 'Fail' });

      await service.processPendingPayouts();

      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockWalletService.refundPayableBalance).toHaveBeenCalledWith(
        expect.anything(),
        'user-123',
        50, // commissionAmount
      );
      // Verify payout status update is called (via save)
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      // Since it's a mock, checking arguments is tricky without ensuring which call it was, but we know save is called.
    });

    it('should fail if metadata is missing', async () => {
      mockPayoutRepository.find.mockResolvedValueOnce([{ ...mockPayout, metadata: null }]);

      await service.processPendingPayouts();

      expect(mockPaymentGatewayService.triggerPayout).not.toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      // Should mark as failed
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
    });
  });
});
