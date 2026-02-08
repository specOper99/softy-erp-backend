import { Body, Controller, Get, Put, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GlobalCacheInterceptor } from '../../common/cache/cache.interceptor';
import { ApiErrorResponses } from '../../common/decorators';
import { Cacheable } from '../../common/decorators/cacheable.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { DashboardService } from './dashboard.service';
import {
  BookingTrendDto,
  DashboardKpiDto,
  ExportFormat,
  ExportQueryDto,
  PackageStatsDto,
  ReportPeriod,
  ReportQueryDto,
  RevenueStatsDto,
  RevenueSummaryDto,
  StaffPerformanceDto,
  StudioKpisDto,
} from './dto/dashboard.dto';
import { UpdateDashboardPreferencesDto } from './dto/update-preferences.dto';
import { UserDashboardConfig } from './entities/user-preference.entity';

import { ReportGeneratorService } from './services/report-generator.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'TOO_MANY_REQUESTS')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(GlobalCacheInterceptor)
@Roles(Role.ADMIN, Role.OPS_MANAGER)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly reportGeneratorService: ReportGeneratorService,
  ) {}

  @Get('kpis')
  @Cacheable()
  @ApiOperation({ summary: 'Get key performance indicators' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'KPI summary returned', type: DashboardKpiDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getKpis(@Query() query: ReportQueryDto): Promise<DashboardKpiDto> {
    return this.dashboardService.getKpiSummary(query);
  }

  @Get('studio-kpis')
  @Cacheable()
  @ApiOperation({
    summary: 'Get aggregated studio KPIs',
    description: 'Returns all studio metrics in a single call: bookings, tasks, staff, revenue, and notifications',
  })
  @ApiResponse({ status: 200, description: 'Studio KPIs retrieved successfully', type: StudioKpisDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getStudioKpis(): Promise<StudioKpisDto> {
    return this.dashboardService.getStudioKpis();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get monthly revenue vs payouts summary' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Revenue summary returned', type: [RevenueSummaryDto] })
  async getSummary(@Query() query: ReportQueryDto): Promise<RevenueSummaryDto[]> {
    return this.dashboardService.getRevenueSummary(query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get detailed revenue statistics' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Revenue stats returned', type: RevenueStatsDto })
  async getRevenue(@Query() query: ReportQueryDto): Promise<RevenueStatsDto> {
    return this.dashboardService.getRevenueStats(query);
  }

  @Get('booking-trends')
  @ApiOperation({ summary: 'Get booking trends over time' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Booking trends returned', type: [BookingTrendDto] })
  async getBookingTrends(@Query() query: ReportQueryDto): Promise<BookingTrendDto[]> {
    return this.dashboardService.getBookingTrends(query);
  }

  @Get('staff-performance')
  @ApiOperation({ summary: 'Get staff performance ranking' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Staff performance returned', type: [StaffPerformanceDto] })
  async getStaffPerformance(@Query() query: ReportQueryDto): Promise<StaffPerformanceDto[]> {
    return this.dashboardService.getStaffPerformance(query);
  }

  @Get('package-stats')
  @ApiOperation({ summary: 'Get service package popularity and revenue' })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Package stats returned', type: [PackageStatsDto] })
  async getPackageStats(@Query() query: ReportQueryDto): Promise<PackageStatsDto[]> {
    return this.dashboardService.getPackageStats(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export dashboard data as CSV or PDF' })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false })
  @ApiQuery({ name: 'period', enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Dashboard report exported' })
  async exportData(@Query() query: ExportQueryDto, @Res() res: Response): Promise<void> {
    const [kpis, revenue, bookingTrends, staffPerformance, packageStats] = await Promise.all([
      this.dashboardService.getKpiSummary(query),
      this.dashboardService.getRevenueStats(query),
      this.dashboardService.getBookingTrends(query),
      this.dashboardService.getStaffPerformance(query),
      this.dashboardService.getPackageStats(query),
    ]);

    if (query.format === ExportFormat.PDF) {
      const pdfBytes = await this.reportGeneratorService.generateDashboardPdf({
        kpis,
        revenue,
        bookingTrends,
        staffPerformance,
        packageStats,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dashboard-report-${new Date().toISOString().split('T')[0]}.pdf"`,
      );
      res.send(Buffer.from(pdfBytes));
    } else {
      // CSV export
      const csvRows: string[] = [];

      // KPIs section
      csvRows.push('=== KEY PERFORMANCE INDICATORS ===');
      csvRows.push('Metric,Value');
      csvRows.push(`Total Revenue,${kpis.totalRevenue}`);
      csvRows.push(`Total Bookings,${kpis.totalBookings}`);
      csvRows.push(`Task Completion Rate,${kpis.taskCompletionRate.toFixed(2)}%`);
      csvRows.push(`Average Booking Value,${kpis.averageBookingValue.toFixed(2)}`);
      csvRows.push(`Active Staff Count,${kpis.activeStaffCount}`);
      csvRows.push('');

      // Revenue section
      csvRows.push('=== REVENUE BY MONTH ===');
      csvRows.push('Month,Revenue,Payouts,Net');
      revenue.revenueByMonth.forEach((r) => {
        csvRows.push(`${r.month},${r.revenue},${r.payouts},${r.net}`);
      });
      csvRows.push('');

      // Booking trends section
      csvRows.push('=== BOOKING TRENDS ===');
      csvRows.push('Date,Total,Confirmed,Completed,Cancelled');
      bookingTrends.forEach((b) => {
        csvRows.push(
          `${b.date},${b.totalBookings},${b.confirmedBookings},${b.completedBookings},${b.cancelledBookings}`,
        );
      });
      csvRows.push('');

      // Staff performance section
      csvRows.push('=== STAFF PERFORMANCE ===');
      csvRows.push('Staff Name,Completed Tasks,Total Commission');
      staffPerformance.forEach((s) => {
        csvRows.push(`${s.staffName},${s.completedTasks},${s.totalCommission}`);
      });
      csvRows.push('');

      // Package stats section
      csvRows.push('=== PACKAGE STATISTICS ===');
      csvRows.push('Package Name,Booking Count,Total Revenue');
      packageStats.forEach((p) => {
        csvRows.push(`${p.packageName},${p.bookingCount},${p.totalRevenue}`);
      });

      const csvContent = csvRows.join('\n');
      const filename = `dashboard-report-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    }
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get user dashboard preferences' })
  @ApiResponse({ status: 200, description: 'Dashboard preferences returned' })
  async getPreferences(@CurrentUser() user: User): Promise<UserDashboardConfig> {
    return this.dashboardService.getUserPreferences(user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update user dashboard preferences' })
  @ApiResponse({ status: 200, description: 'Dashboard preferences updated' })
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateDashboardPreferencesDto,
  ): Promise<UserDashboardConfig> {
    return this.dashboardService.updateUserPreferences(user.id, dto);
  }
}
