import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createMockMetricsFactory } from '../../../../test/helpers/mock-factories';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { Payout } from '../../finance/entities/payout.entity';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { TicketingService } from '../../notifications/services/ticketing.service';
import { TenantsService } from '../../tenants/tenants.service';
import { MockPaymentGatewayService } from '../services/payment-gateway.service';
import { PayrollReconciliationService } from './payroll-reconciliation.service';

describe('PayrollReconciliationService', () => {
  let service: PayrollReconciliationService;
  let payoutRepository: jest.Mocked<Repository<Payout>>;
  let _paymentGatewayService: jest.Mocked<MockPaymentGatewayService>;
  let ticketingService: jest.Mocked<TicketingService>;
  let tenantsService: jest.Mocked<TenantsService>;
  let _dataSource: jest.Mocked<DataSource>;

  const mockPayoutRepository = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockPaymentGatewayService = {
    checkPayoutStatus: jest.fn(),
    triggerPayout: jest.fn(),
  };

  const mockTicketingService = {
    createTicket: jest.fn(),
    isEnabled: jest.fn().mockReturnValue(true),
  };

  const mockTenantsService = {
    findAll: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollReconciliationService,
        { provide: getRepositoryToken(Payout), useValue: mockPayoutRepository },
        { provide: MockPaymentGatewayService, useValue: mockPaymentGatewayService },
        { provide: TicketingService, useValue: mockTicketingService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: MetricsFactory, useValue: createMockMetricsFactory() },
      ],
    }).compile();

    service = module.get<PayrollReconciliationService>(PayrollReconciliationService);
    payoutRepository = module.get(getRepositoryToken(Payout));
    paymentGatewayService = module.get(MockPaymentGatewayService);
    ticketingService = module.get(TicketingService);
    tenantsService = module.get(TenantsService);
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reconcileTenant', () => {
    const tenantId = 'tenant-123';

    it('should return empty array when no stale payouts found', async () => {
      mockPayoutRepository.find.mockResolvedValue([]);
      mockPayoutRepository.count.mockResolvedValue(0);

      const result = await service.reconcileTenant(tenantId);

      expect(result).toEqual([]);
      expect(payoutRepository.find).toHaveBeenCalled();
    });

    it('should detect PENDING_BUT_COMPLETED mismatch', async () => {
      const stalePayout: Partial<Payout> = {
        id: 'payout-1',
        tenantId,
        status: PayoutStatus.PENDING,
        payoutDate: new Date('2020-01-01'),
        metadata: { referenceId: 'REF-123', userId: 'user-1' },
      };

      mockPayoutRepository.find.mockResolvedValue([stalePayout as Payout]);
      mockPayoutRepository.count.mockResolvedValue(1);
      mockPaymentGatewayService.checkPayoutStatus.mockResolvedValue({
        status: 'COMPLETED',
        transactionReference: 'TXN-ABC',
      });

      const result = await service.reconcileTenant(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        payoutId: 'payout-1',
        mismatchType: 'PENDING_BUT_COMPLETED',
        dbStatus: PayoutStatus.PENDING,
        gatewayStatus: 'COMPLETED',
      });
    });

    it('should detect PENDING_BUT_FAILED mismatch', async () => {
      const stalePayout: Partial<Payout> = {
        id: 'payout-2',
        tenantId,
        status: PayoutStatus.PENDING,
        payoutDate: new Date('2020-01-01'),
        metadata: { referenceId: 'REF-FAIL', userId: 'user-2' },
      };

      mockPayoutRepository.find.mockResolvedValue([stalePayout as Payout]);
      mockPayoutRepository.count.mockResolvedValue(1);
      mockPaymentGatewayService.checkPayoutStatus.mockResolvedValue({
        status: 'FAILED',
      });

      const result = await service.reconcileTenant(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0]!.mismatchType).toBe('PENDING_BUT_FAILED');
    });

    it('should return no mismatch when gateway also shows PENDING', async () => {
      const stalePayout: Partial<Payout> = {
        id: 'payout-3',
        tenantId,
        status: PayoutStatus.PENDING,
        payoutDate: new Date('2020-01-01'),
        metadata: { referenceId: 'REF-PENDING', userId: 'user-3' },
      };

      mockPayoutRepository.find.mockResolvedValue([stalePayout as Payout]);
      mockPayoutRepository.count.mockResolvedValue(1);
      mockPaymentGatewayService.checkPayoutStatus.mockResolvedValue({
        status: 'PENDING',
      });

      const result = await service.reconcileTenant(tenantId);

      expect(result).toHaveLength(0);
    });
  });

  describe('runNightlyReconciliation', () => {
    it('should skip execution when advisory lock is not acquired', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ locked: false }]);

      await service.runNightlyReconciliation();

      expect(tenantsService.findAll).not.toHaveBeenCalled();
    });

    it('should process all tenants when lock is acquired', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ locked: true }]) // acquire lock
        .mockResolvedValueOnce(undefined); // release lock

      mockTenantsService.findAll.mockResolvedValue([
        { id: 'tenant-1', slug: 'tenant-1' },
        { id: 'tenant-2', slug: 'tenant-2' },
      ]);

      mockPayoutRepository.find.mockResolvedValue([]);
      mockPayoutRepository.count.mockResolvedValue(0);

      await service.runNightlyReconciliation();

      expect(tenantsService.findAll).toHaveBeenCalled();
    });

    it('should create tickets for mismatches', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce(undefined);

      mockTenantsService.findAll.mockResolvedValue([{ id: 'tenant-1', slug: 'tenant-1' }]);

      const stalePayout: Partial<Payout> = {
        id: 'payout-critical',
        tenantId: 'tenant-1',
        status: PayoutStatus.PENDING,
        payoutDate: new Date('2020-01-01'),
        metadata: { referenceId: 'REF-CRITICAL', userId: 'user-1' },
      };

      mockPayoutRepository.find.mockResolvedValue([stalePayout as Payout]);
      mockPayoutRepository.count.mockResolvedValue(1);
      mockPaymentGatewayService.checkPayoutStatus.mockResolvedValue({
        status: 'COMPLETED',
      });
      mockTicketingService.createTicket.mockResolvedValue('TICKET-123');

      await service.runNightlyReconciliation();

      expect(ticketingService.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('PENDING_BUT_COMPLETED'),
          priority: 'critical',
        }),
      );
    });
  });
});
