import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStatus, TransactionType } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import {
  PackageStatsDto,
  RevenueSummaryDto,
  StaffPerformanceDto,
} from './dto/dashboard.dto';

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
  ) {}

  async getRevenueSummary(): Promise<RevenueSummaryDto[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context missing');
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const stats = await this.transactionRepository
      .createQueryBuilder('t')
      .select("to_char(t.transactionDate, 'YYYY-MM')", 'month')
      .addSelect(
        'SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)',
        'revenue',
      )
      .addSelect(
        'SUM(CASE WHEN t.type = :payroll THEN t.amount ELSE 0 END)',
        'payouts',
      )
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.transactionDate >= :date', { date: sixMonthsAgo })
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

  async getStaffPerformance(): Promise<StaffPerformanceDto[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context missing');
    }

    const stats = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.assignedUser', 'user')
      .select("CONCAT(profile.firstName, ' ', profile.lastName)", 'staffName')
      .addSelect('COUNT(task.id)', 'completedTasks')
      .addSelect('SUM(task.commissionSnapshot)', 'totalCommission')
      .leftJoin(Profile, 'profile', 'profile.userId = user.id')
      .where('task.tenantId = :tenantId', { tenantId })
      .andWhere('task.status = :status', { status: TaskStatus.COMPLETED })
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

  async getPackageStats(): Promise<PackageStatsDto[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context missing');
    }

    const stats = await this.bookingRepository
      .createQueryBuilder('b')
      .innerJoin('b.servicePackage', 'pkg')
      .select('pkg.name', 'packageName')
      .addSelect('COUNT(b.id)', 'bookingCount')
      .addSelect('SUM(b.totalPrice)', 'totalRevenue')
      .where('b.tenantId = :tenantId', { tenantId })
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
}
