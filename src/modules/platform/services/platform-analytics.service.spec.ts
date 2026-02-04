import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../enums/tenant-status.enum';
import { PlatformAnalyticsService } from './platform-analytics.service';

describe('PlatformAnalyticsService', () => {
  let service: PlatformAnalyticsService;
  let tenantRepository: Repository<Tenant>;

  const mockTenants: Partial<Tenant>[] = [
    {
      id: 'tenant-1',
      name: 'Active Tenant 1',
      status: TenantStatus.ACTIVE,
      totalUsers: 15,
      totalBookings: 80,
      totalRevenue: 2000,
      mrr: 200,
      subscriptionTier: 'pro',
      subscriptionStartedAt: new Date('2026-01-01'),
      lastActivityAt: new Date(),
      riskScore: 10,
      healthScore: 90,
    },
    {
      id: 'tenant-2',
      name: 'Active Tenant 2',
      status: TenantStatus.ACTIVE,
      totalUsers: 5,
      totalBookings: 20,
      totalRevenue: 500,
      mrr: 50,
      subscriptionTier: 'starter',
      subscriptionStartedAt: new Date('2026-01-10'),
      lastActivityAt: new Date('2026-01-17'),
      riskScore: 15,
      healthScore: 90,
    },
    {
      id: 'tenant-3',
      name: 'Suspended Tenant',
      status: TenantStatus.SUSPENDED,
      totalUsers: 3,
      totalBookings: 10,
      totalRevenue: 200,
      mrr: 20,
      subscriptionTier: 'starter',
      subscriptionStartedAt: new Date('2025-12-01'),
      lastActivityAt: new Date('2025-12-25'),
      riskScore: 75,
      healthScore: 30,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAnalyticsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlatformAnalyticsService>(PlatformAnalyticsService);
    tenantRepository = module.get(getRepositoryToken(Tenant));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlatformMetrics', () => {
    it('should calculate platform metrics correctly', async () => {
      jest.spyOn(tenantRepository, 'count').mockImplementation(async (options?: any) => {
        if (!options) return 3;
        if (options?.where?.status === TenantStatus.ACTIVE) return 2;
        if (options?.where?.status === TenantStatus.SUSPENDED) return 1;
        if (options?.where?.subscriptionStartedAt) return 0;
        return 0;
      });

      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalUsers: '23',
          totalRevenue: '2700',
          mrr: '270',
        }),
      };
      jest.spyOn(tenantRepository, 'createQueryBuilder').mockReturnValue(qbMock as any);

      const result = await service.getPlatformMetrics();

      expect(result.totalTenants).toBe(3);
      expect(result.activeTenants).toBe(2);
      expect(result.suspendedTenants).toBe(1);
      expect(result.totalUsers).toBe(23);
      expect(result.totalRevenue).toBe(2700);
      expect(result.mrr).toBe(270);
      expect(result.arr).toBe(3240); // MRR * 12
      expect(result.averageRevenuePerTenant).toBe(1350); // (2000+500) / 2 active
    });

    it('should handle empty tenant list', async () => {
      jest.spyOn(tenantRepository, 'count').mockResolvedValue(0);

      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalUsers: '0',
          totalRevenue: '0',
          mrr: '0',
        }),
      };
      jest.spyOn(tenantRepository, 'createQueryBuilder').mockReturnValue(qbMock as any);

      const result = await service.getPlatformMetrics();

      expect(result.totalTenants).toBe(0);
      expect(result.activeTenants).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.mrr).toBe(0);
      expect(result.arr).toBe(0);
      expect(result.averageRevenuePerTenant).toBe(0);
    });

    it('should calculate growth rate based on 30-day window', async () => {
      jest.spyOn(tenantRepository, 'count').mockImplementation(async (options?: any) => {
        if (!options) return 2;
        if (options?.where?.status === TenantStatus.ACTIVE) return 2;
        if (options?.where?.status === TenantStatus.SUSPENDED) return 0;
        if (options?.where?.subscriptionStartedAt) return 1;
        return 0;
      });

      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalUsers: '20',
          totalRevenue: '2500',
          mrr: '250',
        }),
      };
      jest.spyOn(tenantRepository, 'createQueryBuilder').mockReturnValue(qbMock as any);

      const result = await service.getPlatformMetrics();

      expect(result.growthRate).toBeGreaterThan(0);
      expect(result.growthRate).toBeLessThanOrEqual(100);
    });
  });

  describe('getTenantHealth', () => {
    it('should calculate tenant health score', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenants[0] as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result).toHaveProperty('tenantId', 'tenant-1');
      expect(result).toHaveProperty('tenantName', 'Active Tenant 1');
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('activityScore');
      expect(result).toHaveProperty('revenueScore');
      expect(result).toHaveProperty('riskScore', 10);
      expect(result).toHaveProperty('healthStatus');
      expect(result).toHaveProperty('recommendations');
    });

    it('should classify health status as excellent for high scores', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenants[0] as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.overallScore).toBeGreaterThanOrEqual(50);
      expect(['excellent', 'good']).toContain(result.healthStatus);
    });

    it('should classify health status as poor for low scores', async () => {
      const inactiveTenant = {
        ...mockTenants[2],
        lastActivityAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        totalUsers: 0,
        totalRevenue: 0,
        mrr: 0,
        riskScore: 90,
      };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(inactiveTenant as Tenant);

      const result = await service.getTenantHealth('tenant-3');

      expect(result.overallScore).toBeLessThan(50);
      expect(['poor', 'critical', 'fair']).toContain(result.healthStatus);
    });

    it('should throw error for non-existent tenant', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getTenantHealth('non-existent')).rejects.toThrow('Tenant with ID non-existent not found');
    });

    it('should generate recommendations for inactive tenant', async () => {
      const inactiveTenant = {
        ...mockTenants[0],
        lastActivityAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(inactiveTenant as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.recommendations).toContainEqual(expect.stringContaining('30+ days'));
    });

    it('should generate recommendations for low revenue', async () => {
      const lowRevenueTenant = {
        ...mockTenants[0],
        totalRevenue: 50,
        mrr: 10,
      };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(lowRevenueTenant as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.recommendations).toContainEqual(expect.stringContaining('revenue'));
    });

    it('should generate recommendations for high risk score', async () => {
      const highRiskTenant = {
        ...mockTenants[0],
        riskScore: 85,
      };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(highRiskTenant as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.recommendations).toContainEqual(expect.stringContaining('risk'));
    });

    it('should recommend onboarding for tenants with no users', async () => {
      const noUsersTenant = {
        ...mockTenants[0],
        totalUsers: 0,
      };
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(noUsersTenant as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.recommendations).toContainEqual(expect.stringContaining('users'));
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should calculate revenue analytics by plan', async () => {
      const totalsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRevenue: '2500',
          mrr: '250',
        }),
      };
      const byPlanQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { plan: 'pro', count: '1', revenue: '2000' },
          { plan: 'starter', count: '1', revenue: '500' },
        ]),
      };
      const topTenantsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { tenantId: 'tenant-1', name: 'Active Tenant 1', revenue: '2000' },
          { tenantId: 'tenant-2', name: 'Active Tenant 2', revenue: '500' },
        ]),
      };

      jest
        .spyOn(tenantRepository, 'createQueryBuilder')
        .mockReturnValueOnce(totalsQb as any)
        .mockReturnValueOnce(byPlanQb as any)
        .mockReturnValueOnce(topTenantsQb as any);

      const result = await service.getRevenueAnalytics();

      expect(result.totalRevenue).toBe(2500);
      expect(result.mrr).toBe(250);
      expect(result.arr).toBe(3000); // MRR * 12
      expect(result.byPlan).toHaveProperty('pro');
      expect(result.byPlan).toHaveProperty('starter');
      expect(result.byPlan.pro.count).toBe(1);
      expect(result.byPlan.starter.count).toBe(1);
    });

    it('should list top tenants by revenue', async () => {
      const totalsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRevenue: '2500',
          mrr: '250',
        }),
      };
      const byPlanQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      const topTenantsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { tenantId: 'tenant-1', name: 'Active Tenant 1', revenue: '2000' },
          { tenantId: 'tenant-2', name: 'Active Tenant 2', revenue: '500' },
        ]),
      };

      jest
        .spyOn(tenantRepository, 'createQueryBuilder')
        .mockReturnValueOnce(totalsQb as any)
        .mockReturnValueOnce(byPlanQb as any)
        .mockReturnValueOnce(topTenantsQb as any);

      const result = await service.getRevenueAnalytics();

      expect(result.topTenants).toHaveLength(2);
      expect(result.topTenants[0].revenue).toBeGreaterThanOrEqual(result.topTenants[1].revenue);
      expect(result.topTenants[0].tenantId).toBe('tenant-1');
    });

    it('should limit top tenants to 10', async () => {
      const totalsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRevenue: '10000',
          mrr: '1000',
        }),
      };
      const byPlanQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      const topTenantsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(
          Array.from({ length: 10 }, (_, i) => ({
            tenantId: `tenant-${i}`,
            name: `Tenant ${i}`,
            revenue: `${1000 - i * 10}`,
          })),
        ),
      };

      jest
        .spyOn(tenantRepository, 'createQueryBuilder')
        .mockReturnValueOnce(totalsQb as any)
        .mockReturnValueOnce(byPlanQb as any)
        .mockReturnValueOnce(topTenantsQb as any);

      const result = await service.getRevenueAnalytics();

      expect(result.topTenants).toHaveLength(10);
    });

    it('should group free-tier tenants correctly', async () => {
      const totalsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRevenue: '2500',
          mrr: '250',
        }),
      };
      const byPlanQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ plan: null, count: '2', revenue: '2500' }]),
      };
      const topTenantsQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(tenantRepository, 'createQueryBuilder')
        .mockReturnValueOnce(totalsQb as any)
        .mockReturnValueOnce(byPlanQb as any)
        .mockReturnValueOnce(topTenantsQb as any);

      const result = await service.getRevenueAnalytics();

      expect(result.byPlan).toHaveProperty('free');
      expect(result.byPlan.free.count).toBe(2);
    });
  });

  describe('getUsageTrends', () => {
    it('should return usage trends structure for daily period', () => {
      const result = service.getUsageTrends('daily');

      expect(result).toHaveProperty('period', 'daily');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return usage trends structure for weekly period', () => {
      const result = service.getUsageTrends('weekly');

      expect(result).toHaveProperty('period', 'weekly');
      expect(result).toHaveProperty('data');
    });

    it('should return usage trends structure for monthly period', () => {
      const result = service.getUsageTrends('monthly');

      expect(result).toHaveProperty('period', 'monthly');
      expect(result).toHaveProperty('data');
    });
  });
});
