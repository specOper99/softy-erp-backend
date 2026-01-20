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
      totalUsers: 10,
      totalBookings: 50,
      totalRevenue: 1000,
      mrr: 100,
      subscriptionTier: 'pro',
      subscriptionStartedAt: new Date('2026-01-01'),
      lastActivityAt: new Date('2026-01-18'),
      riskScore: 20,
      healthScore: 85,
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
      jest.spyOn(tenantRepository, 'find').mockResolvedValue(mockTenants as Tenant[]);

      const result = await service.getPlatformMetrics();

      expect(result.totalTenants).toBe(3);
      expect(result.activeTenants).toBe(2);
      expect(result.suspendedTenants).toBe(1);
      expect(result.totalUsers).toBe(18);
      expect(result.totalRevenue).toBe(1700);
      expect(result.mrr).toBe(170);
      expect(result.arr).toBe(2040); // MRR * 12
      expect(result.averageRevenuePerTenant).toBe(850); // (1000+500) / 2 active
    });

    it('should handle empty tenant list', async () => {
      jest.spyOn(tenantRepository, 'find').mockResolvedValue([]);

      const result = await service.getPlatformMetrics();

      expect(result.totalTenants).toBe(0);
      expect(result.activeTenants).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.mrr).toBe(0);
      expect(result.arr).toBe(0);
      expect(result.averageRevenuePerTenant).toBe(0);
    });

    it('should calculate growth rate based on 30-day window', async () => {
      const recentTenant = {
        ...mockTenants[0],
        subscriptionStartedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      };
      const oldTenant = {
        ...mockTenants[1],
        subscriptionStartedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(tenantRepository, 'find').mockResolvedValue([recentTenant, oldTenant] as Tenant[]);

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
      expect(result).toHaveProperty('riskScore', 20);
      expect(result).toHaveProperty('healthStatus');
      expect(result).toHaveProperty('recommendations');
    });

    it('should classify health status as excellent for high scores', async () => {
      jest.spyOn(tenantRepository, 'findOne').mockResolvedValue(mockTenants[0] as Tenant);

      const result = await service.getTenantHealth('tenant-1');

      expect(result.overallScore).toBeGreaterThanOrEqual(60);
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
      jest.spyOn(tenantRepository, 'find').mockResolvedValue(mockTenants as Tenant[]);

      const result = await service.getRevenueAnalytics();

      expect(result.totalRevenue).toBe(1700); // All tenants: 1000 + 500 + 200
      expect(result.mrr).toBe(170); // All tenants: 100 + 50 + 20
      expect(result.arr).toBe(2040); // MRR * 12
      expect(result.byPlan).toHaveProperty('pro');
      expect(result.byPlan).toHaveProperty('starter');
      expect(result.byPlan.pro.count).toBe(1);
      expect(result.byPlan.starter.count).toBe(2); // tenant-2 and tenant-3
    });

    it('should list top tenants by revenue', async () => {
      jest.spyOn(tenantRepository, 'find').mockResolvedValue(mockTenants as Tenant[]);

      const result = await service.getRevenueAnalytics();

      expect(result.topTenants).toHaveLength(3);
      expect(result.topTenants[0].revenue).toBeGreaterThanOrEqual(result.topTenants[1].revenue);
      expect(result.topTenants[0].tenantId).toBe('tenant-1');
    });

    it('should limit top tenants to 10', async () => {
      const manyTenants = Array.from({ length: 15 }, (_, i) => ({
        ...mockTenants[0],
        id: `tenant-${i}`,
        name: `Tenant ${i}`,
        totalRevenue: 1000 - i * 10,
      }));
      jest.spyOn(tenantRepository, 'find').mockResolvedValue(manyTenants as Tenant[]);

      const result = await service.getRevenueAnalytics();

      expect(result.topTenants).toHaveLength(10);
    });

    it('should group free-tier tenants correctly', async () => {
      const freeTenants = [
        { ...mockTenants[0], subscriptionTier: null },
        { ...mockTenants[1], subscriptionTier: undefined },
      ];
      jest.spyOn(tenantRepository, 'find').mockResolvedValue(freeTenants as Tenant[]);

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
