import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import {
  BudgetResponseDto,
  CreateBudgetDto,
  FinancialReportFilterDto,
  PackageProfitabilityDto,
  ProfitabilityQueryDto,
} from '../dto';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { PurchaseInvoice } from '../entities/purchase-invoice.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { PnLEntry } from '../types/report.types';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import {
  ClientStatementQueryDto,
  EmployeeStatementQueryDto,
  StatementLineDto,
  StatementResponseDto,
  StatementTotalsDto,
  VendorStatementQueryDto,
} from '../dto/statement.dto';

import { DepartmentBudgetRepository } from '../repositories/department-budget.repository';
import { TransactionRepository } from '../repositories/transaction.repository';

@Injectable()
export class FinancialReportService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly budgetRepository: DepartmentBudgetRepository,
    private readonly cacheUtils: CacheUtilsService,
    @InjectRepository(PurchaseInvoice)
    private readonly purchaseInvoiceRepository: Repository<PurchaseInvoice>,
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
    TenantContextService.getTenantIdOrThrow();

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
      .andWhere('budget.period = :period', { period })
      .getRawOne<{ minStart: Date; maxEnd: Date }>();

    const minStartDate = dateRange?.minStart ?? new Date();
    const maxEndDate = dateRange?.maxEnd ?? new Date();

    // Single aggregated query for all departments instead of N queries
    const spendingByDepartment = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.department', 'department')
      .addSelect('SUM(CAST(t.amount AS DECIMAL) * CAST(t.exchange_rate AS DECIMAL))', 'total')
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

  async getPackageProfitability(query: ProfitabilityQueryDto): Promise<PackageProfitabilityDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const rows = await this.transactionRepository
      .createQueryBuilder('tq')
      .select('b.package_id', 'packageId')
      .addSelect(
        `COALESCE(SUM((
          SELECT COALESCE(SUM(CASE WHEN t.type = :incomeType THEN t.amount ELSE 0 END), 0)
          FROM transactions t
          WHERE t.tenant_id = b.tenant_id
            AND t.booking_id = b.id
            AND t.transaction_date >= :startDate
            AND t.transaction_date <= :endDate
        )), 0)`,
        'revenue',
      )
      .addSelect(
        `COALESCE(SUM((
          SELECT COALESCE(SUM(CASE WHEN t.type = :expenseType THEN t.amount ELSE 0 END), 0)
          FROM transactions t
          WHERE t.tenant_id = b.tenant_id
            AND t.booking_id = b.id
            AND t.transaction_date >= :startDate
            AND t.transaction_date <= :endDate
        )), 0)`,
        'expenses',
      )
      .addSelect(
        `COALESCE(SUM((
          SELECT COALESCE(
            SUM(
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM task_assignees ta
                  WHERE ta.tenant_id = task.tenant_id
                    AND ta.task_id = task.id
                ) THEN (
                  SELECT COALESCE(SUM(ta2.commission_snapshot), 0)
                  FROM task_assignees ta2
                  WHERE ta2.tenant_id = task.tenant_id
                    AND ta2.task_id = task.id
                )
                ELSE COALESCE(task.commission_snapshot, 0)
              END
            ),
            0
          )
          FROM tasks task
          WHERE task.tenant_id = b.tenant_id
            AND task.booking_id = b.id
            AND task.status = :completedTaskStatus
        )), 0)`,
        'commissions',
      )
      .from('bookings', 'b')
      .where('b.tenant_id = :tenantId', { tenantId })
      .andWhere('b.event_date >= :startDate', { startDate: query.startDate })
      .andWhere('b.event_date <= :endDate', { endDate: query.endDate })
      .groupBy('b.package_id')
      .orderBy('revenue', 'DESC')
      .setParameters({
        incomeType: TransactionType.INCOME,
        expenseType: TransactionType.EXPENSE,
        completedTaskStatus: TaskStatus.COMPLETED,
      })
      .getRawMany<{
        packageId: string;
        revenue: string | number;
        commissions: string | number;
        expenses: string | number;
      }>();

    return rows
      .map((row) => {
        const revenue = MathUtils.parseFinancialAmount(row.revenue);
        const commissions = MathUtils.parseFinancialAmount(row.commissions);
        const expenses = MathUtils.parseFinancialAmount(row.expenses);

        return {
          packageId: row.packageId,
          revenue,
          commissions,
          expenses,
          netProfit: MathUtils.subtract(MathUtils.subtract(revenue, commissions), expenses),
        };
      })
      .sort((a, b) => {
        if (b.revenue !== a.revenue) {
          return b.revenue - a.revenue;
        }
        return a.packageId.localeCompare(b.packageId);
      });
  }

  async getClientStatement(query: ClientStatementQueryDto): Promise<StatementResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const rows = await this.transactionRepository
      .createQueryBuilder('t')
      .innerJoin('bookings', 'b', 'b.id = t.booking_id AND b.tenant_id = t.tenant_id')
      .select('t.id', 'id')
      .addSelect('t.type', 'type')
      .addSelect('t.amount', 'amount')
      .addSelect('t.category', 'category')
      .addSelect('t.description', 'description')
      .addSelect('t.transaction_date', 'transactionDate')
      .addSelect('t.booking_id', 'referenceId')
      .addSelect('t.currency', 'currency')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('b.client_id = :clientId', { clientId: query.clientId })
      .andWhere('t.transaction_date >= :startDate', { startDate: query.startDate })
      .andWhere('t.transaction_date <= :endDate', { endDate: query.endDate })
      .andWhere('t.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .orderBy('t.transaction_date', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
      .getRawMany<StatementRawRow>();

    return this.buildStatementResponse(query.clientId, query.startDate, query.endDate, rows);
  }

  async getVendorStatement(query: VendorStatementQueryDto): Promise<StatementResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const rows = await this.purchaseInvoiceRepository
      .createQueryBuilder('pi')
      .innerJoin('transactions', 't', 't.id = pi.transaction_id AND t.tenant_id = pi.tenant_id')
      .select('t.id', 'id')
      .addSelect('t.type', 'type')
      .addSelect('t.amount', 'amount')
      .addSelect('t.category', 'category')
      .addSelect('t.description', 'description')
      .addSelect('t.transaction_date', 'transactionDate')
      .addSelect('pi.invoice_number', 'referenceId')
      .addSelect('t.currency', 'currency')
      .where('pi.tenant_id = :tenantId', { tenantId })
      .andWhere('pi.vendor_id = :vendorId', { vendorId: query.vendorId })
      .andWhere('pi.invoice_date >= :startDate', { startDate: query.startDate })
      .andWhere('pi.invoice_date <= :endDate', { endDate: query.endDate })
      .orderBy('pi.invoice_date', 'ASC')
      .addOrderBy('pi.created_at', 'ASC')
      .getRawMany<StatementRawRow>();

    return this.buildStatementResponse(query.vendorId, query.startDate, query.endDate, rows);
  }

  async getEmployeeStatement(query: EmployeeStatementQueryDto): Promise<StatementResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const rows = await this.transactionRepository
      .createQueryBuilder('t')
      .innerJoin('payouts', 'p', 'p.id = t.payout_id AND p.tenant_id = t.tenant_id')
      .select('t.id', 'id')
      .addSelect('t.type', 'type')
      .addSelect('t.amount', 'amount')
      .addSelect('t.category', 'category')
      .addSelect('t.description', 'description')
      .addSelect('t.transaction_date', 'transactionDate')
      .addSelect('t.payout_id', 'referenceId')
      .addSelect('t.currency', 'currency')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.type = :type', { type: TransactionType.PAYROLL })
      .andWhere('t.transaction_date >= :startDate', { startDate: query.startDate })
      .andWhere('t.transaction_date <= :endDate', { endDate: query.endDate })
      .andWhere("p.metadata->>'userId' = :userId", { userId: query.userId })
      .orderBy('t.transaction_date', 'ASC')
      .addOrderBy('t.created_at', 'ASC')
      .getRawMany<StatementRawRow>();

    return this.buildStatementResponse(query.userId, query.startDate, query.endDate, rows);
  }

  private buildStatementResponse(
    entityId: string,
    startDate: string,
    endDate: string,
    rows: StatementRawRow[],
  ): StatementResponseDto {
    const lines: StatementLineDto[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: MathUtils.parseFinancialAmount(row.amount),
      category: row.category,
      description: row.description,
      transactionDate: row.transactionDate instanceof Date ? row.transactionDate : new Date(row.transactionDate),
      referenceId: row.referenceId ?? undefined,
    }));

    const totals = this.calculateStatementTotals(lines);

    return {
      entityId,
      startDate,
      endDate,
      currency: rows[0]?.currency,
      totals,
      lines,
    };
  }

  private calculateStatementTotals(lines: StatementLineDto[]): StatementTotalsDto {
    const totals: StatementTotalsDto = {
      income: 0,
      expense: 0,
      payroll: 0,
      net: 0,
    };

    for (const line of lines) {
      if (line.type === TransactionType.INCOME) {
        totals.income += line.amount;
      } else if (line.type === TransactionType.EXPENSE) {
        totals.expense += line.amount;
      } else if (line.type === TransactionType.PAYROLL) {
        totals.payroll += line.amount;
      }
    }

    totals.net = MathUtils.subtract(MathUtils.subtract(totals.income, totals.expense), totals.payroll);

    return totals;
  }
}

interface StatementRawRow {
  id: string;
  type: TransactionType;
  amount: string | number;
  category: string | null;
  description: string | null;
  transactionDate: Date | string;
  referenceId: string | null;
  currency: string;
}
