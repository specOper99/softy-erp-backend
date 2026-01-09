import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';

import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { TenantsService } from '../../tenants/tenants.service';
import {
  BudgetResponseDto,
  CreateBudgetDto,
  CreateTransactionDto,
  FinancialReportFilterDto,
  TransactionFilterDto,
} from '../dto';
import { DepartmentBudget } from '../entities/department-budget.entity';
import { EmployeeWallet } from '../entities/employee-wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { PnLEntry } from '../types/report.types';
import { CurrencyService } from './currency.service';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(EmployeeWallet)
    private readonly walletRepository: Repository<EmployeeWallet>,

    @InjectRepository(DepartmentBudget)
    private readonly budgetRepository: Repository<DepartmentBudget>,
    private readonly dataSource: DataSource,
    private readonly currencyService: CurrencyService,
    private readonly tenantsService: TenantsService,
    private readonly exportService: ExportService,
    private readonly dashboardGateway: DashboardGateway,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  // Cache TTL: 5 minutes for financial reports (staleness allowed for performance)
  private readonly REPORT_CACHE_TTL = 5 * 60 * 1000;

  private getReportCacheKey(
    tenantId: string,
    reportType: string,
    dateRange: string,
  ): string {
    return `finance:report:${tenantId}:${reportType}:${dateRange}`;
  }

  // Transaction Methods
  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.createTransactionInternal(tenantId, dto);
  }

  async createSystemTransaction(
    tenantId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.createTransactionInternal(tenantId, dto);
  }

  private async createTransactionInternal(
    tenantId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Validate transaction amount with comprehensive checks
    this.validateTransactionAmount(dto.amount, dto.currency);

    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const currency = dto.currency || tenant.baseCurrency;
    const exchangeRate = this.currencyService.getExchangeRate(
      currency,
      tenant.baseCurrency,
    );

    // Round amount to 2 decimal places for precision using safe math
    const roundedAmount = MathUtils.round(dto.amount, 2);

    const transaction = this.transactionRepository.create({
      ...dto,
      amount: roundedAmount,
      currency,
      exchangeRate,
      transactionDate: new Date(dto.transactionDate),
      tenantId,
    });
    const savedTransaction = await this.transactionRepository.save(transaction);

    // Notify dashboard
    this.dashboardGateway.broadcastMetricsUpdate(tenantId, 'REVENUE', {
      action: 'TRANSACTION_RECORDED',
      amount: savedTransaction.amount,
      type: savedTransaction.type,
      transactionId: savedTransaction.id,
    });

    // Invalidate financial report caches (data has changed)
    // REMOVED: To prevent cache thrashing on high volume. We rely on 5-min TTL.
    // await this.invalidateReportCaches(tenantId);

    return savedTransaction;
  }

  /**
   * Validates transaction amount with comprehensive checks for financial operations.
   * Prevents fraud, rounding errors, and data corruption.
   */
  private validateTransactionAmount(amount: number, currency?: string): void {
    // Must be a valid finite number
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('finance.amount_must_be_valid_number');
    }

    // Must be positive
    if (amount <= 0) {
      throw new BadRequestException('finance.amount_must_be_positive');
    }

    // Currency-specific decimal precision
    const precision = currency === 'IQD' ? 0 : 2;
    const [_integer, decimal] = amount.toString().split('.');
    if (decimal && decimal.length > precision) {
      throw new BadRequestException(
        `finance.amount_precision_error: Maximum ${precision} decimal places allowed for ${currency || 'default currency'}`,
      );
    }

    // Maximum amount validation
    if (amount > 999999999.99) {
      throw new BadRequestException('finance.amount_exceeds_maximum');
    }

    // Validate no NaN or Infinity after calculations
    if (Number.isNaN(amount) || !Number.isFinite(amount)) {
      throw new BadRequestException('finance.amount_invalid');
    }
  }

  async createTransactionWithManager(
    manager: EntityManager,
    data: {
      type: TransactionType;
      amount: number;
      category?: string;
      bookingId?: string;
      taskId?: string;
      payoutId?: string;
      description?: string;
      transactionDate: Date;
    },
  ): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const transaction = manager.create(Transaction, { ...data, tenantId });
    return manager.save(transaction);
  }

  async findAllTransactions(
    filter?: TransactionFilterDto,
  ): Promise<Transaction[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const queryBuilder = this.transactionRepository.createQueryBuilder('t');

    queryBuilder.where('t.tenantId = :tenantId', { tenantId });

    if (filter?.type) {
      queryBuilder.andWhere('t.type = :type', { type: filter.type });
    }

    if (filter?.startDate && filter?.endDate) {
      queryBuilder.andWhere('t.transactionDate BETWEEN :start AND :end', {
        start: new Date(filter.startDate),
        end: new Date(filter.endDate),
      });
    }

    return queryBuilder
      .orderBy('t.transactionDate', 'DESC')
      .skip(filter?.getSkip())
      .take(filter?.getTake())
      .getMany();
  }

  async findAllTransactionsCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: Transaction[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.transactionRepository.createQueryBuilder('t');

    qb.where('t.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateWithCustomDateField(
      qb,
      {
        cursor: query.cursor,
        limit: query.limit,
        alias: 't',
      },
      'transactionDate',
    );
  }

  async findTransactionById(id: string): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const transaction = await this.transactionRepository.findOne({
      where: { id, tenantId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async exportTransactionsToCSV(res: Response): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryStream = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId })
      .orderBy('t.transactionDate', 'DESC')
      .stream();

    try {
      const fields = [
        'id',
        'type',
        'amount',
        'currency',
        'exchangeRate',
        'category',
        'department',
        'bookingId',
        'taskId',
        'payoutId',
        'description',
        'transactionDate',
        'createdAt',
      ];

      const transformFn = (row: unknown) => {
        const typedRow = row as {
          t_id?: string;
          t_type?: string;
          t_amount?: string;
          t_currency?: string;
          t_exchange_rate?: string;
          t_category?: string;
          t_department?: string;
          t_booking_id?: string;
          t_task_id?: string;
          t_payout_id?: string;
          t_description?: string;
          t_transaction_date?: string;
          t_created_at?: string;
        };

        return {
          id: typedRow.t_id ?? 'unknown',
          type: typedRow.t_type ?? 'UNKNOWN',
          amount: Number(typedRow.t_amount ?? 0),
          currency: typedRow.t_currency ?? '',
          exchangeRate: Number(typedRow.t_exchange_rate ?? 1),
          category: typedRow.t_category ?? '',
          department: typedRow.t_department ?? '',
          bookingId: typedRow.t_booking_id ?? '',
          taskId: typedRow.t_task_id ?? '',
          payoutId: typedRow.t_payout_id ?? '',
          description: typedRow.t_description ?? '',
          transactionDate: typedRow.t_transaction_date
            ? new Date(typedRow.t_transaction_date).toISOString()
            : '',
          createdAt: typedRow.t_created_at
            ? new Date(typedRow.t_created_at).toISOString()
            : '',
        };
      };

      this.exportService.streamFromStream(
        res,
        queryStream,
        `transactions-export-${new Date().toISOString().split('T')[0]}.csv`,
        fields,
        transformFn,
      );
    } finally {
      const streamWithDestroy = queryStream as unknown;
      if (
        streamWithDestroy &&
        typeof streamWithDestroy === 'object' &&
        'destroy' in streamWithDestroy
      ) {
        await (streamWithDestroy as { destroy: () => Promise<void> }).destroy();
      }
    }
  }

  async getTransactionSummary(): Promise<{
    totalIncome: number;
    totalExpenses: number;
    totalPayroll: number;
    netBalance: number;
    currency: Currency;
  }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const tenant = await this.tenantsService.findOne(tenantId);
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId })
      .select('t.type', 'type')
      .addSelect(
        'SUM(CAST(t.amount AS DECIMAL) * CAST(t.exchange_rate AS DECIMAL))',
        'total',
      )
      .groupBy('t.type')
      .getRawMany<{ type: TransactionType; total: string }>();

    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      totalPayroll: 0,
      netBalance: 0,
      currency: tenant.baseCurrency,
    };

    for (const row of result) {
      const amount = parseFloat(row.total) || 0;
      switch (row.type) {
        case TransactionType.INCOME:
          summary.totalIncome = amount;
          break;
        case TransactionType.EXPENSE:
          summary.totalExpenses = amount;
          break;
        case TransactionType.PAYROLL:
          summary.totalPayroll = amount;
          break;
      }
    }

    summary.netBalance =
      summary.totalIncome - summary.totalExpenses - summary.totalPayroll;
    return summary;
  }

  // Wallet Methods
  async getOrCreateWallet(userId: string): Promise<EmployeeWallet> {
    return this.dataSource.transaction(async (manager) => {
      return this.getOrCreateWalletWithManager(manager, userId);
    });
  }

  async getOrCreateWalletWithManager(
    manager: EntityManager,
    userId: string,
  ): Promise<EmployeeWallet> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      });
      wallet = await manager.save(wallet);
    }
    return wallet;
  }

  async getWalletByUserId(userId: string): Promise<EmployeeWallet | null> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.walletRepository.findOne({
      where: { userId, tenantId },
      relations: ['user'],
    });
  }

  async getAllWallets(
    query: PaginationDto = new PaginationDto(),
  ): Promise<EmployeeWallet[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.walletRepository.find({
      where: { tenantId },
      relations: ['user'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  /**
   * Add pending commission to a user's wallet.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async addPendingCommission(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'addPendingCommission');
    if (amount <= 0) {
      throw new BadRequestException('Commission amount must be positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    let wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      wallet = manager.create(EmployeeWallet, {
        userId,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      });
    }
    wallet.pendingBalance = MathUtils.add(
      Number(wallet.pendingBalance),
      Number(amount),
    );
    return manager.save(wallet);
  }

  /**
   * Subtract pending commission from a user's wallet.
   * Used when reassigning a task to reverse the old user's commission.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async subtractPendingCommission(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'subtractPendingCommission');
    if (amount <= 0) {
      throw new BadRequestException('Commission amount must be positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    const newBalance = MathUtils.subtract(
      Number(wallet.pendingBalance),
      Number(amount),
    );
    wallet.pendingBalance = Math.max(0, newBalance);
    return manager.save(wallet);
  }

  /**
   * Move commission from pending to payable balance.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async moveToPayable(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'moveToPayable');
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive');
    }
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }

    // Validate sufficient pending balance before transfer
    const currentPending = Number(wallet.pendingBalance);
    const transferAmount = Number(amount);

    if (transferAmount > currentPending) {
      throw new BadRequestException(
        `Insufficient pending balance: ${currentPending.toFixed(2)} < ${transferAmount.toFixed(2)}`,
      );
    }

    wallet.pendingBalance = MathUtils.subtract(currentPending, transferAmount);
    wallet.payableBalance = MathUtils.add(
      Number(wallet.payableBalance),
      transferAmount,
    );
    return manager.save(wallet);
  }

  /**
   * Reset payable balance to zero after payout.
   * @requires MUST be called within an active transaction context
   * @throws Error if called outside transaction
   */
  async resetPayableBalance(
    manager: EntityManager,
    userId: string,
  ): Promise<EmployeeWallet> {
    this.assertTransactionActive(manager, 'resetPayableBalance');
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const wallet = await manager.findOne(EmployeeWallet, {
      where: { userId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    wallet.payableBalance = 0;
    return manager.save(wallet);
  }

  async upsertBudget(dto: CreateBudgetDto): Promise<DepartmentBudget> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    let budget = await this.budgetRepository.findOne({
      where: {
        tenantId,
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
        tenantId,
      });
    }

    return this.budgetRepository.save(budget);
  }

  async getProfitAndLoss(filter: FinancialReportFilterDto, nocache = false) {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const dateRange = `${filter.startDate}_${filter.endDate}`;
    const cacheKey = this.getReportCacheKey(tenantId, 'pnl', dateRange);

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
      .addSelect(
        "SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END)",
        'income',
      )
      .addSelect(
        "SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END)",
        'expenses',
      )
      .addSelect(
        "SUM(CASE WHEN t.type = 'PAYROLL' THEN t.amount ELSE 0 END)",
        'payroll',
      )
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany<{
        period: string;
        income: string;
        expenses: string;
        payroll: string;
      }>();

    const reportData: PnLEntry[] = result.map((row) => {
      const income = parseFloat(row.income) || 0;
      const expenses = parseFloat(row.expenses) || 0;
      const payroll = parseFloat(row.payroll) || 0;

      return {
        period: row.period,
        income,
        expenses,
        payroll,
        net: income - expenses - payroll,
      };
    });

    // Cache the result
    await this.cacheUtils.set(cacheKey, reportData, this.REPORT_CACHE_TTL);

    return reportData;
  }

  async getBudgetReport(period: string): Promise<BudgetResponseDto[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const budgets = await this.budgetRepository.find({
      where: { tenantId, period },
      order: { department: 'ASC' },
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
      .addSelect(
        'SUM(CAST(t.amount AS DECIMAL) * CAST(t.exchange_rate AS DECIMAL))',
        'total',
      )
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
      spendingMap.set(row.department, parseFloat(row.total || '0'));
    }

    // Build report using the map - O(n) instead of O(n²)
    const report: BudgetResponseDto[] = budgets.map((budget) => {
      const actualSpent = spendingMap.get(budget.department) || 0;
      const variance = Number(budget.budgetAmount) - actualSpent;
      const utilizationPercentage =
        Number(budget.budgetAmount) > 0
          ? (actualSpent / Number(budget.budgetAmount)) * 100
          : 0;

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

  /**
   * Validates that an EntityManager is within an active transaction.
   * Prevents wallet race conditions by ensuring atomic operations.
   */
  private assertTransactionActive(
    manager: EntityManager,
    methodName: string,
  ): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        `${methodName} must be called within an active transaction context`,
      );
    }
  }
}
