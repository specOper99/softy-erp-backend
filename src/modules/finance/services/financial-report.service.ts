import { Injectable } from '@nestjs/common';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { BudgetResponseDto, CreateBudgetDto, FinancialReportFilterDto } from '../dto';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { PnLEntry } from '../types/report.types';

import { DepartmentBudgetRepository } from '../repositories/department-budget.repository';
import { TransactionRepository } from '../repositories/transaction.repository';

@Injectable()
export class FinancialReportService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly budgetRepository: DepartmentBudgetRepository,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  // Cache TTL: 5 minutes for financial reports (staleness allowed for performance)
  private readonly REPORT_CACHE_TTL = 5 * 60 * 1000;

  private readonly MAX_BUDGET_REPORT_DEPARTMENTS = 500;

  private getReportCacheKey(tenantId: string, version: string, reportType: string, dateRange: string): string {
    return `finance:report:${tenantId}:v${version}:${reportType}:${dateRange}`;
  }

  private async getFinancialVersion(tenantId: string): Promise<string> {
    const key = `finance:version:${tenantId}`;
    let version = await this.cacheUtils.get<string>(key);
    if (!version) {
      version = Date.now().toString();
      await this.cacheUtils.set(key, version, 0); // Infinite TTL (or very long)
    }
    return version;
  }

  async invalidateReportCaches(tenantId: string): Promise<void> {
    const key = `finance:version:${tenantId}`;
    const newVersion = Date.now().toString();
    // Use a long TTL, e.g., 30 days
    await this.cacheUtils.set(key, newVersion, 30 * 24 * 60 * 60 * 1000);
  }

  async upsertBudget(dto: CreateBudgetDto): Promise<DepartmentBudget> {
    let budget = await this.budgetRepository.findOne({
      where: {
        department: dto.department,
        period: dto.period,
      },
    });

    if (budget) {
      budget.budgetAmount = dto.budgetAmount;
      budget.startDate = new Date(dto.startDate);
      budget.endDate = new Date(dto.endDate);
      if (dto.notes) budget.notes = dto.notes;
    } else {
      budget = this.budgetRepository.create({
        department: dto.department,
        period: dto.period,
        budgetAmount: dto.budgetAmount,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        notes: dto.notes,
      });
    }

    return this.budgetRepository.save(budget);
  }

  async getProfitAndLoss(filter: FinancialReportFilterDto, nocache = false) {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const dateRange = `${filter.startDate}_${filter.endDate}`;
    const version = await this.getFinancialVersion(tenantId);
    const cacheKey = this.getReportCacheKey(tenantId, version, 'pnl', dateRange);

    // Try cache first
    if (!nocache) {
      const cached = await this.cacheUtils.get<
        Array<{
          period: string;
          income: number;
          expenses: number;
          payroll: number;
          net: number;
        }>
      >(cacheKey);
      if (cached) return cached;
    }

    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.transactionDate >= :startDate', {
        startDate: filter.startDate,
      })
      .andWhere('t.transactionDate <= :endDate', { endDate: filter.endDate })
      .select("to_char(t.transactionDate, 'YYYY-MM')", 'period')
      .addSelect("SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END)", 'income')
      .addSelect("SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END)", 'expenses')
      .addSelect("SUM(CASE WHEN t.type = 'PAYROLL' THEN t.amount ELSE 0 END)", 'payroll')
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany<{
        period: string;
        income: string;
        expenses: string;
        payroll: string;
      }>();

    const reportData: PnLEntry[] = result.map((row) => {
      const income = MathUtils.parseFinancialAmount(row.income);
      const expenses = MathUtils.parseFinancialAmount(row.expenses);
      const payroll = MathUtils.parseFinancialAmount(row.payroll);

      return {
        period: row.period,
        income,
        expenses,
        payroll,
        net: MathUtils.subtract(MathUtils.subtract(income, expenses), payroll),
      };
    });

    // Cache the result
    await this.cacheUtils.set(cacheKey, reportData, this.REPORT_CACHE_TTL);

    return reportData;
  }

  async getBudgetReport(period: string): Promise<BudgetResponseDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const budgets = await this.budgetRepository.find({
      where: { period },
      order: { department: 'ASC' },
      take: this.MAX_BUDGET_REPORT_DEPARTMENTS,
    });

    if (budgets.length === 0) {
      return [];
    }

    const budgetDepartments = budgets.map((b) => b.department);

    const dateRange = await this.budgetRepository
      .createQueryBuilder('budget')
      .select('MIN(budget.startDate)', 'minStart')
      .addSelect('MAX(budget.endDate)', 'maxEnd')
      .where('budget.tenantId = :tenantId', { tenantId })
      .andWhere('budget.period = :period', { period })
      .getRawOne<{ minStart: Date; maxEnd: Date }>();

    const minStartDate = dateRange?.minStart ?? new Date();
    const maxEndDate = dateRange?.maxEnd ?? new Date();

    // Single aggregated query for all departments instead of N queries
    const spendingByDepartment = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.department', 'department')
      .addSelect('SUM(CAST(t.amount AS DECIMAL) * CAST(t.exchange_rate AS DECIMAL))', 'total')
      .where('t.tenantId = :tenantId', { tenantId })
      .andWhere('t.department IN (:...departments)', {
        departments: budgetDepartments,
      })
      .andWhere('t.transactionDate >= :start', { start: minStartDate })
      .andWhere('t.transactionDate <= :end', { end: maxEndDate })
      .andWhere('t.type IN (:...types)', {
        types: [TransactionType.EXPENSE, TransactionType.PAYROLL],
      })
      .groupBy('t.department')
      .getRawMany<{ department: string; total: string | null }>();

    // Create a map for O(1) lookup instead of N lookups
    const spendingMap = new Map<string, number>();
    for (const row of spendingByDepartment) {
      spendingMap.set(row.department, MathUtils.parseFinancialAmount(row.total));
    }

    // Build report using the map - O(n) instead of O(n²)
    const report: BudgetResponseDto[] = budgets.map((budget) => {
      const actualSpent = spendingMap.get(budget.department) || 0;
      const variance = Number(budget.budgetAmount) - actualSpent;
      const utilizationPercentage =
        Number(budget.budgetAmount) > 0 ? (actualSpent / Number(budget.budgetAmount)) * 100 : 0;

      return {
        id: budget.id,
        department: budget.department,
        budgetAmount: Number(budget.budgetAmount),
        period: budget.period,
        startDate: budget.startDate,
        endDate: budget.endDate,
        actualSpent,
        variance,
        utilizationPercentage,
      };
    });

    return report;
  }
}
