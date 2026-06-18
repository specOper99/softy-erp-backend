import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MockPaymentGatewayService } from '../../hr/services/payment-gateway.service';
import { TenantsService } from '../../tenants/tenants.service';
import type { Payout } from '../entities/payout.entity';
import { PayoutStatus } from '../enums/payout-status.enum';
import { PayoutRepository } from '../repositories/payout.repository';
import { PayoutConsistencyCron } from './payout-consistency.cron';

describe('PayoutConsistencyCron', () => {
  let cron: PayoutConsistencyCron;

  const stuckPayout = {
    id: 'payout-stuck',
    tenantId: 'tenant-1',
    amount: 500,
    commissionAmount: 25,
    status: PayoutStatus.PENDING,
    metadata: { referenceId: 'ref-stuck' },
  } as unknown as Payout;

  const mockPayoutRepository = {
    findStuckPayouts: jest.fn(),
  };

  const mockPaymentGateway = {
    checkPayoutStatus: jest.fn().mockResolvedValue({ status: 'PENDING' }),
  };

  const mockTenantsService = {
    findAll: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
  };

  const mockDistributedLockService = {
    withLock: jest.fn().mockImplementation(async (_key: string, callback: () => Promise<unknown>) => callback()),
  };

  const mockGauge = { set: jest.fn() };
  const mockMetricsFactory = {
    getOrCreateGauge: jest.fn().mockReturnValue(mockGauge),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutConsistencyCron,
        { provide: PayoutRepository, useValue: mockPayoutRepository },
        { provide: MockPaymentGatewayService, useValue: mockPaymentGateway },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: DistributedLockService, useValue: mockDistributedLockService },
        { provide: MetricsFactory, useValue: mockMetricsFactory },
      ],
    }).compile();

    cron = module.get(PayoutConsistencyCron);
    jest.clearAllMocks();
    mockPayoutRepository.findStuckPayouts.mockResolvedValue([stuckPayout]);
    mockDistributedLockService.withLock.mockImplementation(async (_key: string, callback: () => Promise<unknown>) =>
      callback(),
    );
  });

  it('detects stuck payouts per tenant and updates gauge', async () => {
    await cron.monitorStuckPayouts();

    expect(mockDistributedLockService.withLock).toHaveBeenCalledWith('payout:consistency-check', expect.any(Function), {
      ttl: 60000,
    });
    expect(mockPayoutRepository.findStuckPayouts).toHaveBeenCalledWith(10, 100);
    expect(mockPaymentGateway.checkPayoutStatus).toHaveBeenCalledWith('ref-stuck');
    expect(mockGauge.set).toHaveBeenCalledWith(1);
  });

  it('runs findStuckPayouts inside tenant context', async () => {
    const runSpy = jest.spyOn(TenantContextService, 'run');

    await cron.monitorStuckPayouts();

    expect(runSpy).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    runSpy.mockRestore();
  });

  it('skips when distributed lock is not acquired', async () => {
    mockDistributedLockService.withLock.mockResolvedValue(null);

    await cron.monitorStuckPayouts();

    expect(mockPayoutRepository.findStuckPayouts).not.toHaveBeenCalled();
    expect(mockGauge.set).not.toHaveBeenCalled();
  });
});
