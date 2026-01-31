import { Test, TestingModule } from '@nestjs/testing';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';
import { UsageMetric, UsageRecord } from '../entities/usage-record.entity';
import { UsageRecordRepository } from '../repositories/usage-record.repository';
import { MeteringService } from './metering.service';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

describe('MeteringService', () => {
  let service: MeteringService;
  let usageRecordRepo: jest.Mocked<Repository<UsageRecord>>;
  let stripeService: jest.Mocked<StripeService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;

  const mockTenantId = 'tenant-123';
  const mockUsageRecord = {
    id: 'usage-1',
    tenantId: mockTenantId,
    metric: UsageMetric.API_CALLS,
    quantity: 100,
    periodStart: new Date(),
    periodEnd: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeteringService,
        {
          provide: UsageRecordRepository,
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: SubscriptionService,
          useValue: {
            getSubscription: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MeteringService>(MeteringService);
    usageRecordRepo = module.get(UsageRecordRepository);
    stripeService = module.get(StripeService);
    subscriptionService = module.get(SubscriptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordUsage', () => {
    it('should record usage without subscription', async () => {
      usageRecordRepo.create.mockReturnValue(mockUsageRecord as unknown as UsageRecord);
      usageRecordRepo.save.mockResolvedValue(mockUsageRecord as unknown as UsageRecord);
      subscriptionService.getSubscription.mockResolvedValue(null);

      const result = await service.recordUsage(mockTenantId, UsageMetric.API_CALLS, 100);

      expect(usageRecordRepo.create).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        metric: UsageMetric.API_CALLS,
        quantity: 100,
        periodStart: expect.any(Date),
        periodEnd: expect.any(Date),
        metadata: undefined,
      });
      expect(result).toEqual(mockUsageRecord);
    });

    it('should record usage with subscription', async () => {
      const mockSubscription = { id: 'sub-123' };
      usageRecordRepo.create.mockReturnValue({ ...mockUsageRecord } as unknown as UsageRecord);
      usageRecordRepo.save.mockResolvedValue({
        ...mockUsageRecord,
        subscriptionId: 'sub-123',
      } as unknown as UsageRecord);
      subscriptionService.getSubscription.mockResolvedValue(mockSubscription as unknown as Subscription);

      const result = await service.recordUsage(mockTenantId, UsageMetric.API_CALLS, 50);

      expect(subscriptionService.getSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(result).toBeDefined();
    });

    it('should record usage with metadata', async () => {
      const metadata = { endpoint: '/api/bookings' };
      usageRecordRepo.create.mockReturnValue(mockUsageRecord as unknown as UsageRecord);
      usageRecordRepo.save.mockResolvedValue(mockUsageRecord as unknown as UsageRecord);
      subscriptionService.getSubscription.mockResolvedValue(null);

      await service.recordUsage(mockTenantId, UsageMetric.API_CALLS, 1, metadata);

      expect(usageRecordRepo.create).toHaveBeenCalledWith(expect.objectContaining({ metadata }));
    });

    it('should handle Stripe sync errors gracefully', async () => {
      usageRecordRepo.create.mockReturnValue(mockUsageRecord as unknown as UsageRecord);
      usageRecordRepo.save.mockResolvedValue(mockUsageRecord as unknown as UsageRecord);
      subscriptionService.getSubscription.mockResolvedValue(null);
      stripeService.isConfigured.mockReturnValue(true);

      // Should not throw even if Stripe sync fails
      const result = await service.recordUsage(mockTenantId, UsageMetric.STORAGE_GB, 10);

      expect(result).toEqual(mockUsageRecord);
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary grouped by metric', async () => {
      const mockRawResults = [
        { metric: UsageMetric.API_CALLS, total: '500' },
        { metric: UsageMetric.STORAGE_GB, total: '25' },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawResults),
      };
      usageRecordRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<UsageRecord>,
      );

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await service.getUsageSummary(mockTenantId, startDate, endDate);

      expect(usageRecordRepo.createQueryBuilder).toHaveBeenCalledWith('record');
      expect(result[UsageMetric.API_CALLS]).toBe(500);
      expect(result[UsageMetric.STORAGE_GB]).toBe(25);
    });

    it('should return empty summary when no usage', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      usageRecordRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as SelectQueryBuilder<UsageRecord>,
      );

      const result = await service.getUsageSummary(mockTenantId, new Date('2024-01-01'), new Date('2024-01-31'));

      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
