import { TargetTenant } from '../../../common/decorators/target-tenant.decorator';
import { SkipTenant } from '../../tenants/decorators/skip-tenant.decorator';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireContext } from '../../../common/decorators/context.decorator';
import { ContextType } from '../../../common/enums/context-type.enum';
import { PlatformContextGuard } from '../../../common/guards/platform-context.guard';
import { RequirePlatformPermissions } from '../decorators/platform-permissions.decorator';
import { PlatformPermission } from '../enums/platform-permission.enum';
import { PlatformJwtAuthGuard } from '../guards/platform-jwt-auth.guard';
import { PlatformPermissionsGuard } from '../guards/platform-permissions.guard';
import { PlatformAnalyticsService } from '../services/platform-analytics.service';

/**
 * Controller for platform analytics and metrics
 */
@ApiTags('Platform - Analytics')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/analytics')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformAnalyticsController {
  constructor(private readonly analyticsService: PlatformAnalyticsService) {}

  @Get('metrics')
  @RequirePlatformPermissions(PlatformPermission.ANALYTICS_VIEW_PLATFORM_METRICS)
  @ApiOperation({
    summary: 'Get platform-wide metrics',
    description: `Retrieve aggregated metrics across all tenants for the platform dashboard.

**Required Permission:** \`platform:analytics:view-metrics\`
**Allowed Roles:** SUPER_ADMIN, ANALYTICS_ADMIN

Includes: total tenants, active users, storage usage, API request volumes`,
  })
  @ApiResponse({
    status: 200,
    description: 'Platform metrics',
    schema: {
      type: 'object',
      properties: {
        totalTenants: { type: 'number' },
        activeTenants: { type: 'number' },
        totalUsers: { type: 'number' },
        activeUsersLast30Days: { type: 'number' },
        totalStorageGB: { type: 'number' },
        apiRequestsLast24h: { type: 'number' },
      },
    },
  })
  async getPlatformMetrics() {
    return this.analyticsService.getPlatformMetrics();
  }

  @Get('tenant/:tenantId/health')
  @PlatformAdmin()
  @RequirePlatformPermissions(PlatformPermission.ANALYTICS_VIEW_TENANT_HEALTH)
  @ApiOperation({
    summary: 'Get tenant health status',
    description: `Retrieve health metrics for a specific tenant including performance indicators and potential issues.

**Required Permission:** \`platform:analytics:view-tenant-health\`
**Allowed Roles:** SUPER_ADMIN, SUPPORT_ADMIN, ANALYTICS_ADMIN

Health factors: API response times, error rates, resource utilization`,
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Tenant health metrics',
    schema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['HEALTHY', 'DEGRADED', 'CRITICAL'] },
        healthScore: { type: 'number', minimum: 0, maximum: 100 },
        issues: { type: 'array', items: { type: 'string' } },
        lastChecked: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getTenantHealth(@TargetTenant() tenantId: string) {
    return this.analyticsService.getTenantHealth(tenantId);
  }

  @Get('revenue')
  @RequirePlatformPermissions(PlatformPermission.ANALYTICS_VIEW_REVENUE_REPORTS)
  @ApiOperation({
    summary: 'Get revenue analytics',
    description: `Retrieve revenue analytics across all tenants including MRR, ARR, and billing trends.

**Required Permission:** \`platform:analytics:view-revenue\`
**Allowed Roles:** SUPER_ADMIN, BILLING_ADMIN

Includes: monthly recurring revenue, churn rate, growth metrics`,
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue analytics',
    schema: {
      type: 'object',
      properties: {
        mrr: { type: 'number', description: 'Monthly Recurring Revenue' },
        arr: { type: 'number', description: 'Annual Recurring Revenue' },
        churnRate: { type: 'number', description: 'Percentage' },
        growthRate: { type: 'number', description: 'Month-over-month growth %' },
        revenueByPlan: {
          type: 'object',
          additionalProperties: { type: 'number' },
        },
      },
    },
  })
  async getRevenueAnalytics() {
    return this.analyticsService.getRevenueAnalytics();
  }

  @Get('usage-trends')
  @RequirePlatformPermissions(PlatformPermission.ANALYTICS_VIEW_PLATFORM_METRICS)
  @ApiOperation({
    summary: 'Get usage trends',
    description: `Retrieve historical usage trends across the platform.

**Required Permission:** \`platform:analytics:view-metrics\`
**Allowed Roles:** SUPER_ADMIN, ANALYTICS_ADMIN`,
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time period granularity (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage trend data',
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        dataPoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date' },
              activeUsers: { type: 'number' },
              apiCalls: { type: 'number' },
              storageUsed: { type: 'number' },
            },
          },
        },
      },
    },
  })
  getUsageTrends(@Query('period') period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    return this.analyticsService.getUsageTrends(period);
  }
}
