import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../common/cache/cache-utils.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { DailyMetrics } from '../analytics/entities/daily-metrics.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { Transaction } from '../finance/entities/transaction.entity';
import { TransactionType } from '../finance/enums/transaction-type.enum';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import {
  BookingTrendDto,
  DashboardKpiDto,
  PackageStatsDto,
  ReportPeriod,
  ReportQueryDto,
  RevenueStatsDto,
  RevenueSummaryDto,
  StaffPerformanceDto,
} from './dto/dashboard.dto';
import { UpdateDashboardPreferencesDto } from './dto/update-preferences.dto';
import { UserDashboardConfig, UserPreference } from './entities/user-preference.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(UserPreference)
    private readonly preferenceRepository: Repository<UserPreference>,
    @InjectRepository(DailyMetrics)
    private readonly metricsRepository: Repository<DailyMetrics>,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  // Cache TTL: 5 minutes for KPIs
  private readonly KPI_CACHE_TTL = 5 * 60 * 1000;

  private getKpiCacheKey(tenantId: string, period: string): string {
    return `dashboard:kpi:${tenantId}:${period}`;
  }

  private getDateRange(query: ReportQueryDto): { start: Date; end: Date } {
    const end = query.endDate ? new Date(query.endDate) : new Date();
    let start: Date;

    if (query.period === ReportPeriod.CUSTOM && query.startDate) {
      start = new Date(query.startDate);
    } else {
      start = new Date(end);
      switch (query.period) {
        case ReportPeriod.DAY:
          start.setDate(start.getDate() - 1);
          break;
        case ReportPeriod.WEEK:
          start.setDate(start.getDate() - 7);
          break;
        case ReportPeriod.QUARTER:
          start.setMonth(start.getMonth() - 3);
          break;
        case ReportPeriod.YEAR:
          start.setFullYear(start.getFullYear() - 1);
          break;
        case ReportPeriod.MONTH:
        default:
          start.setMonth(start.getMonth() - 1);
          break;
      }
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private getContext(query: ReportQueryDto): { tenantId: string; start: Date; end: Date } {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) throw new BadRequestException('common.tenant_missing');

    const { start, end } = this.getDateRange(query);
    return { tenantId, start, end };
  }

  async getKpiSummary(query: ReportQueryDto = {}, nocache = false): Promise<DashboardKpiDto> {
    const { tenantId, start, end } = this.getContext(query);
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    const periodKey = `${startDateStr}_${endDateStr}`;
    const cacheKey = this.getKpiCacheKey(tenantId, periodKey);

    // Try cache first
    if (!nocache) {
      const cached = await this.cacheUtils.get<DashboardKpiDto>(cacheKey);
      if (cached) return cached;
    }

    // Use Read Model (DailyMetrics) for high-level KPIs
    const [metricsResult, tasksResult, staffResult] = await Promise.all([
      this.metricsRepository
        .createQueryBuilder('m')
        .select('SUM(m.totalRevenue)', 'revenue')
        .addSelect('SUM(m.bookingsCount)', 'bookings')
        .where('m.tenantId = :tenantId', { tenantId })
        .andWhere('m.date >= :startDate AND m.date <= :endDate', {
          startDate: startDateStr,
          endDate: endDateStr,
        })
        .getRawOne<{ revenue: string; bookings: string }>(),

      this.taskRepository
        .createQueryBuilder('t')
        .select('COUNT(t.id)', 'total')
        .addSelect('SUM(CASE WHEN t.status = :completed THEN 1 ELSE 0 END)', 'completed')
        .where('t.tenantId = :tenantId', { tenantId })
        .andWhere('t.createdAt BETWEEN :start AND :end', { start, end })
        .setParameter('completed', TaskStatus.COMPLETED)
        .getRawOne<{ total: string; completed: string }>(),

      this.profileRepository.count({ where: { tenantId } }),
    ]);

    const totalRevenue = Number(metricsResult?.revenue) || 0;
    const totalBookings = Number(metricsResult?.bookings) || 0;
    const totalTasks = Number(tasksResult?.total) || 0;
    const completedTasks = Number(tasksResult?.completed) || 0;

    const result: DashboardKpiDto = {
      totalRevenue,
      totalBookings,
      taskCompletionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      averageBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
      activeStaffCount: staffResult || 0,
    };

    // Cache the result
    await this.cacheUtils.set(cacheKey, result, this.KPI_CACHE_TTL);

    return result;
  }

  async getBookingTrends(query: ReportQueryDto = {}): Promise<BookingTrendDto[]> {
    const { tenantId, start, end } = this.getContext(query);

    const stats = await this.bookingRepository
      .createQueryBuilder('b')
      .select("to_char(b.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(b.id)', 'totalBookings')
      .addSelect('SUM(CASE WHEN b.status = :confirmed THEN 1 ELSE 0 END)', 'confirmedBookings')
      .addSelect('SUM(CASE WHEN b.status = :completed THEN 1 ELSE 0 END)', 'completedBookings')
      .addSelect('SUM(CASE WHEN b.status = :cancelled THEN 1 ELSE 0 END)', 'cancelledBookings')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.createdAt BETWEEN :start AND :end', { start, end })
      .setParameter('confirmed', BookingStatus.CONFIRMED)
      .setParameter('completed', BookingStatus.COMPLETED)
      .setParameter('cancelled', BookingStatus.CANCELLED)
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{
        date: string;
        totalBookings: string;
        confirmedBookings: string;
        completedBookings: string;
        cancelledBookings: string;
      }>();

    return stats.map((s) => ({
      date: s.date,
      totalBookings: Number(s.totalBookings) || 0,
      confirmedBookings: Number(s.confirmedBookings) || 0,
      completedBookings: Number(s.completedBookings) || 0,
      cancelledBookings: Number(s.cancelledBookings) || 0,
    }));
  }

  async getRevenueStats(query: ReportQueryDto = {}): Promise<RevenueStatsDto> {
    const { tenantId, start, end } = this.getContext(query);

    const totals = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'revenue')
      .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'expenses')
      .addSelect('SUM(CASE WHEN t.type = :payroll THEN t.amount ELSE 0 END)', 'payroll')
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.transactionDate BETWEEN :start AND :end', { start, end })
      .setParameter('income', TransactionType.INCOME)
      .setParameter('expense', TransactionType.EXPENSE)
      .setParameter('payroll', TransactionType.PAYROLL)
      .getRawOne<{ revenue: string; expenses: string; payroll: string }>();

    const revenueByMonth = await this.getRevenueSummary(query);

    const totalRevenue = Number(totals?.revenue) || 0;
    const totalExpenses = Number(totals?.expenses) || 0;
    const totalPayroll = Number(totals?.payroll) || 0;

    return {
      totalRevenue,
      totalExpenses,
      totalPayroll,
      netProfit: totalRevenue - totalExpenses - totalPayroll,
      revenueByMonth,
    };
  }

  async getRevenueSummary(query: ReportQueryDto = {}): Promise<RevenueSummaryDto[]> {
    const { tenantId, start, end } = this.getContext(query);

    const stats = await this.transactionRepository
      .createQueryBuilder('t')
      .select("to_char(t.transactionDate, 'YYYY-MM')", 'month')
      .addSelect('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'revenue')
      .addSelect('SUM(CASE WHEN t.type = :payroll THEN t.amount ELSE 0 END)', 'payouts')
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.transactionDate BETWEEN :start AND :end', { start, end })
      .setParameter('income', TransactionType.INCOME)
      .setParameter('payroll', TransactionType.PAYROLL)
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; revenue: string; payouts: string }>();

    return stats.map((s) => ({
      month: s.month,
      revenue: Number(s.revenue) || 0,
      payouts: Number(s.payouts) || 0,
      net: (Number(s.revenue) || 0) - (Number(s.payouts) || 0),
    }));
  }

  async getStaffPerformance(query: ReportQueryDto = {}): Promise<StaffPerformanceDto[]> {
    const { tenantId, start, end } = this.getContext(query);

    const stats = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.assignedUser', 'user')
      .select("CONCAT(profile.firstName, ' ', profile.lastName)", 'staffName')
      .addSelect('COUNT(task.id)', 'completedTasks')
      .addSelect('SUM(task.commissionSnapshot)', 'totalCommission')
      .leftJoin(Profile, 'profile', 'profile.userId = user.id')
      .where('task.tenantId = :tenantId', { tenantId })
      .andWhere('task.status = :status', { status: TaskStatus.COMPLETED })
      .andWhere('task.updatedAt BETWEEN :start AND :end', { start, end })
      .groupBy('staffName')
      .orderBy('totalCommission', 'DESC')
      .take(50)
      .getRawMany<{
        staffName: string;
        completedTasks: string;
        totalCommission: string;
      }>();

    return stats.map((s) => ({
      staffName: s.staffName || 'Unknown Staff',
      completedTasks: Number(s.completedTasks) || 0,
      totalCommission: Number(s.totalCommission) || 0,
    }));
  }

  async getPackageStats(query: ReportQueryDto = {}): Promise<PackageStatsDto[]> {
    const { tenantId, start, end } = this.getContext(query);

    const stats = await this.bookingRepository
      .createQueryBuilder('b')
      .innerJoin('b.servicePackage', 'pkg')
      .select('pkg.name', 'packageName')
      .addSelect('COUNT(b.id)', 'bookingCount')
      .addSelect('SUM(b.totalPrice)', 'totalRevenue')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('pkg.name')
      .orderBy('bookingCount', 'DESC')
      .take(50)
      .getRawMany<{
        packageName: string;
        bookingCount: string;
        totalRevenue: string;
      }>();

    return stats.map((s) => ({
      packageName: s.packageName,
      bookingCount: Number(s.bookingCount) || 0,
      totalRevenue: Number(s.totalRevenue) || 0,
    }));
  }
  async getUserPreferences(userId: string): Promise<UserDashboardConfig> {
    const prefs = await this.preferenceRepository.findOne({
      where: { userId },
    });
    const config = prefs?.dashboardConfig;
    if (!config || !Array.isArray(config.widgets)) {
      return { widgets: [] };
    }
    return config;
  }

  async updateUserPreferences(userId: string, dto: UpdateDashboardPreferencesDto): Promise<UserDashboardConfig> {
    let prefs = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!prefs) {
      prefs = this.preferenceRepository.create({
        userId,
        dashboardConfig: { widgets: dto.widgets },
      });
    } else {
      prefs.dashboardConfig = { widgets: dto.widgets };
    }

    const saved = await this.preferenceRepository.save(prefs);
    return saved.dashboardConfig;
  }
}
