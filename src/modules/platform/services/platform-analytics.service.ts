import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TenantStatus } from '../../tenants/enums/tenant-status.enum';

interface TenantMetricData {
  lastActivityAt?: Date | null;
  totalUsers?: number | null;
  totalBookings?: number | null;
  totalRevenue?: number | null;
  mrr?: number | null;
  riskScore?: number | null;
}

export interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalRevenue: number;
  mrr: number;
  arr: number;
  growthRate: number;
  churnRate: number;
  averageRevenuePerTenant: number;
}

export interface TenantHealthScore {
  tenantId: string;
  tenantName: string;
  overallScore: number;
  activityScore: number;
  revenueScore: number;
  riskScore: number;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  recommendations: string[];
}

export interface RevenueAnalytics {
  totalRevenue: number;
  mrr: number;
  arr: number;
  byPlan: Record<string, { count: number; revenue: number }>;
  growth: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  topTenants: Array<{
    tenantId: string;
    name: string;
    revenue: number;
  }>;
}

export interface UsageTrends {
  period: 'daily' | 'weekly' | 'monthly';
  data: Array<{
    date: Date;
    activeUsers: number;
    totalBookings: number;
    revenue: number;
  }>;
}

/**
 * Service for platform analytics and metrics
 */
@Injectable()
export class PlatformAnalyticsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  private parseDbNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  async getPlatformMetrics(): Promise<PlatformMetrics> {
    const [totalTenants, activeTenants, suspendedTenants] = await Promise.all([
      this.tenantRepository.count(),
      this.tenantRepository.count({ where: { status: TenantStatus.ACTIVE } }),
      this.tenantRepository.count({ where: { status: TenantStatus.SUSPENDED } }),
    ]);

    const sums = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('COALESCE(SUM(tenant.totalUsers), 0)', 'totalUsers')
      .addSelect('COALESCE(SUM(tenant.totalRevenue), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(tenant.mrr), 0)', 'mrr')
      .getRawOne<{ totalUsers: string; totalRevenue: string; mrr: string }>();

    const totalUsers = this.parseDbNumber(sums?.totalUsers);
    const totalRevenue = this.parseDbNumber(sums?.totalRevenue);
    const mrr = this.parseDbNumber(sums?.mrr);
    const arr = mrr * 12;

    // Calculate growth rate (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newTenants = await this.tenantRepository.count({
      where: { subscriptionStartedAt: MoreThan(thirtyDaysAgo) },
    });
    const growthRate = totalTenants > 0 ? (newTenants / totalTenants) * 100 : 0;

    const averageRevenuePerTenant = activeTenants > 0 ? totalRevenue / activeTenants : 0;

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalUsers,
      totalRevenue,
      mrr,
      arr,
      growthRate: Math.round(growthRate * 100) / 100,
      churnRate: 0, // Would need historical data
      averageRevenuePerTenant: Math.round(averageRevenuePerTenant * 100) / 100,
    };
  }

  async getTenantHealth(tenantId: string): Promise<TenantHealthScore> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: [
        'id',
        'name',
        'totalUsers',
        'totalBookings',
        'totalRevenue',
        'mrr',
        'lastActivityAt',
        'riskScore',
        'healthScore',
      ],
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const activityScore = this.calculateActivityScore(tenant);
    const revenueScore = this.calculateRevenueScore(tenant);
    const riskScore = tenant.riskScore || 0;

    const overallScore = Math.round(activityScore * 0.4 + revenueScore * 0.4 + (100 - riskScore) * 0.2);

    let healthStatus: TenantHealthScore['healthStatus'];
    if (overallScore >= 80) healthStatus = 'excellent';
    else if (overallScore >= 60) healthStatus = 'good';
    else if (overallScore >= 40) healthStatus = 'fair';
    else if (overallScore >= 20) healthStatus = 'poor';
    else healthStatus = 'critical';

    const recommendations = this.generateRecommendations(tenant, activityScore, revenueScore, riskScore);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      overallScore,
      activityScore,
      revenueScore,
      riskScore,
      healthStatus,
      recommendations,
    };
  }

  async getRevenueAnalytics(): Promise<RevenueAnalytics> {
    const totals = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('COALESCE(SUM(tenant.totalRevenue), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(tenant.mrr), 0)', 'mrr')
      .where('tenant.status = :status', { status: TenantStatus.ACTIVE })
      .getRawOne<{ totalRevenue: string; mrr: string }>();

    const totalRevenue = this.parseDbNumber(totals?.totalRevenue);
    const mrr = this.parseDbNumber(totals?.mrr);
    const arr = mrr * 12;

    const byPlanRows = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('tenant.subscriptionTier', 'plan')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(tenant.totalRevenue), 0)', 'revenue')
      .where('tenant.status = :status', { status: TenantStatus.ACTIVE })
      .groupBy('tenant.subscriptionTier')
      .getRawMany<{ plan: string | null; count: string; revenue: string }>();

    const byPlan: Record<string, { count: number; revenue: number }> = {};
    for (const row of byPlanRows) {
      const planKey = row.plan ?? 'free';
      byPlan[planKey] = {
        count: this.parseDbNumber(row.count),
        revenue: this.parseDbNumber(row.revenue),
      };
    }

    const topTenantsRows = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('tenant.id', 'tenantId')
      .addSelect('tenant.name', 'name')
      .addSelect('COALESCE(tenant.totalRevenue, 0)', 'revenue')
      .where('tenant.status = :status', { status: TenantStatus.ACTIVE })
      .orderBy('COALESCE(tenant.totalRevenue, 0)', 'DESC')
      .take(10)
      .getRawMany<{ tenantId: string; name: string; revenue: string }>();

    const topTenants = topTenantsRows.map((row) => ({
      tenantId: row.tenantId,
      name: row.name,
      revenue: this.parseDbNumber(row.revenue),
    }));

    return {
      totalRevenue,
      mrr,
      arr,
      byPlan,
      growth: {
        daily: 0, // Would need time-series data
        weekly: 0,
        monthly: 0,
      },
      topTenants,
    };
  }

  getUsageTrends(period: 'daily' | 'weekly' | 'monthly'): UsageTrends {
    // This would typically query a time-series database or analytics store
    // For now, return structure
    return {
      period,
      data: [],
    };
  }

  private calculateActivityScore(tenant: TenantMetricData): number {
    const daysSinceActivity = tenant.lastActivityAt
      ? Math.floor((Date.now() - tenant.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    let score = 100;
    if (daysSinceActivity > 30) score = 20;
    else if (daysSinceActivity > 14) score = 40;
    else if (daysSinceActivity > 7) score = 60;
    else if (daysSinceActivity > 3) score = 80;

    const usersScore = Math.min((tenant.totalUsers || 0) * 5, 100);
    const bookingsScore = Math.min((tenant.totalBookings || 0) / 10, 100);

    return Math.round(score * 0.5 + usersScore * 0.25 + bookingsScore * 0.25);
  }

  private calculateRevenueScore(tenant: TenantMetricData): number {
    const mrr = tenant.mrr || 0;
    const totalRevenue = tenant.totalRevenue || 0;

    let mrrScore = 0;
    if (mrr >= 1000) mrrScore = 100;
    else if (mrr >= 500) mrrScore = 80;
    else if (mrr >= 200) mrrScore = 60;
    else if (mrr >= 50) mrrScore = 40;
    else if (mrr > 0) mrrScore = 20;

    let revenueScore = 0;
    if (totalRevenue >= 10000) revenueScore = 100;
    else if (totalRevenue >= 5000) revenueScore = 80;
    else if (totalRevenue >= 1000) revenueScore = 60;
    else if (totalRevenue >= 100) revenueScore = 40;
    else if (totalRevenue > 0) revenueScore = 20;

    return Math.round(mrrScore * 0.6 + revenueScore * 0.4);
  }

  private generateRecommendations(
    tenant: TenantMetricData,
    activityScore: number,
    revenueScore: number,
    riskScore: number,
  ): string[] {
    const recommendations: string[] = [];

    if (activityScore < 50) {
      recommendations.push('Low activity detected - consider reaching out to tenant');
    }

    if (revenueScore < 50) {
      recommendations.push('Low revenue - explore upsell opportunities or payment issues');
    }

    if (riskScore > 70) {
      recommendations.push('High risk score - review security and compliance');
    }

    const daysSinceActivity = tenant.lastActivityAt
      ? Math.floor((Date.now() - tenant.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceActivity > 30) {
      recommendations.push('No activity in 30+ days - possible churn risk');
    }

    if ((tenant.totalUsers || 0) === 0) {
      recommendations.push('No users created - onboarding assistance may be needed');
    }

    return recommendations;
  }
}
