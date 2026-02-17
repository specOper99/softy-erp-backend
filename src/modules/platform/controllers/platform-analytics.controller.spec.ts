import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { PlatformAnalyticsService } from '../services/platform-analytics.service';
import { PlatformAnalyticsController } from './platform-analytics.controller';

describe('PlatformAnalyticsController', () => {
  let controller: PlatformAnalyticsController;
  let analyticsService: PlatformAnalyticsService;
  let tenantContextRunSpy: jest.SpyInstance;

  const mockMetrics = {
    totalTenants: 150,
    activeTenants: 145,
    totalUsers: 5280,
    activeUsersLast30Days: 3890,
    totalStorageGB: 2500,
    apiRequestsLast24h: 1250000,
  };

  const mockTenantHealth = {
    tenantId: 'tenant-123',
    status: 'HEALTHY',
    healthScore: 95,
    issues: [],
    lastChecked: new Date(),
  };

  const mockRevenueAnalytics = {
    mrr: 125000,
    arr: 1500000,
    churnRate: 0.02,
    growthRate: 0.05,
    revenueByPlan: {
      starter: 25000,
      pro: 75000,
      enterprise: 25000,
    },
  };

  const mockUsageTrends = {
    period: 'daily',
    dataPoints: [
      {
        date: '2025-01-15',
        activeUsers: 3890,
        apiCalls: 125000,
        storageUsed: 250,
      },
      {
        date: '2025-01-16',
        activeUsers: 3920,
        apiCalls: 128000,
        storageUsed: 252,
      },
    ],
  };

  beforeEach(async () => {
    tenantContextRunSpy = jest
      .spyOn(TenantContextService, 'run')
      .mockImplementation((_: string, callback: () => unknown) => callback());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformAnalyticsController],
      providers: [
        {
          provide: PlatformAnalyticsService,
          useValue: {
            getPlatformMetrics: jest.fn().mockResolvedValue(mockMetrics),
            getTenantHealth: jest.fn().mockResolvedValue(mockTenantHealth),
            getRevenueAnalytics: jest.fn().mockResolvedValue(mockRevenueAnalytics),
            getUsageTrends: jest.fn().mockReturnValue(mockUsageTrends),
          },
        },
      ],
    }).compile();

    controller = module.get<PlatformAnalyticsController>(PlatformAnalyticsController);
    analyticsService = module.get<PlatformAnalyticsService>(PlatformAnalyticsService);
  });

  afterEach(() => {
    tenantContextRunSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('getPlatformMetrics', () => {
    it('should retrieve platform-wide metrics', async () => {
      const result = await controller.getPlatformMetrics();

      expect(analyticsService.getPlatformMetrics).toHaveBeenCalled();
      expect(result).toEqual(mockMetrics);
    });

    it('should include tenant statistics', async () => {
      const result = await controller.getPlatformMetrics();

      expect(result).toHaveProperty('totalTenants');
      expect(result).toHaveProperty('activeTenants');
    });

    it('should include user analytics', async () => {
      const result = await controller.getPlatformMetrics();

      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('activeUsersLast30Days');
    });

    it('should include storage and API metrics', async () => {
      const result = await controller.getPlatformMetrics();

      expect(result).toHaveProperty('totalStorageGB');
      expect(result).toHaveProperty('apiRequestsLast24h');
    });
  });

  describe('getTenantHealth', () => {
    it('should retrieve health status for specific tenant', async () => {
      const tenantId = 'tenant-123';

      const result = await controller.getTenantHealth(tenantId);

      expect(analyticsService.getTenantHealth).toHaveBeenCalledWith(tenantId);
      expect(result.tenantId).toBe(tenantId);
    });

    it('should return health information', async () => {
      const result = await controller.getTenantHealth('tenant-123');

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should retrieve revenue analytics', async () => {
      const result = await controller.getRevenueAnalytics();

      expect(analyticsService.getRevenueAnalytics).toHaveBeenCalled();
      expect(result).toEqual(mockRevenueAnalytics);
    });

    it('should include MRR and ARR', async () => {
      const result = await controller.getRevenueAnalytics();

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should include revenue metrics', async () => {
      const result = await controller.getRevenueAnalytics();

      expect(result).toHaveProperty('mrr');
      expect(result).toHaveProperty('arr');
      expect(result).toHaveProperty('churnRate');
    });
  });

  describe('getUsageTrends', () => {
    it('should retrieve usage trends with default period', () => {
      const result = controller.getUsageTrends(undefined);

      expect(analyticsService.getUsageTrends).toHaveBeenCalledWith('daily');
      expect(result).toBeDefined();
    });

    it('should respect period parameter', () => {
      controller.getUsageTrends('weekly');

      expect(analyticsService.getUsageTrends).toHaveBeenCalledWith('weekly');
    });

    it('should support different time period granularities', () => {
      const periods: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];

      for (const period of periods) {
        analyticsService.getUsageTrends = jest.fn().mockReturnValue({
          period,
        });

        controller.getUsageTrends(period);

        expect(analyticsService.getUsageTrends).toHaveBeenCalledWith(period);
      }
    });

    it('should return usage trend data', () => {
      const result = controller.getUsageTrends('daily');

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
