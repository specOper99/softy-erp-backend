import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import Decimal from 'decimal.js';

import { DashboardGateway } from '../../dashboard/dashboard.gateway';
import { TenantsService } from '../../tenants/tenants.service';
import { CreateTransactionDto, TransactionFilterDto } from '../dto';
import { Transaction } from '../entities/transaction.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { CurrencyService } from './currency.service';
import { FinancialReportService } from './financial-report.service';
import { WalletService } from './wallet.service';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly currencyService: CurrencyService,
    private readonly tenantsService: TenantsService,
    private readonly exportService: ExportService,
    private readonly dashboardGateway: DashboardGateway,
    private readonly walletService: WalletService,
    private readonly financialReportService: FinancialReportService,
  ) {}

  // Transaction Methods
  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.createTransactionInternal(tenantId, dto);
  }

  async createSystemTransaction(tenantId: string, dto: CreateTransactionDto): Promise<Transaction> {
    return this.createTransactionInternal(tenantId, dto);
  }

  private async createTransactionInternal(tenantId: string, dto: CreateTransactionDto): Promise<Transaction> {
    // Validate transaction amount with comprehensive checks
    this.validateTransactionAmount(dto.amount, dto.currency);

    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const currency = dto.currency || tenant.baseCurrency;
    const exchangeRate = this.currencyService.getExchangeRate(currency, tenant.baseCurrency);

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
    await this.financialReportService.invalidateReportCaches(tenantId);

    return savedTransaction;
  }

  /**
   * Validates transaction amount with comprehensive checks for financial operations.
   * Prevents fraud, rounding errors, and data corruption.
   */
  private validateTransactionAmount(amount: number, currency?: Currency): void {
    // Must be a valid finite number
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('finance.amount_must_be_valid_number');
    }

    // Must be positive
    if (amount <= 0) {
      throw new BadRequestException('finance.amount_must_be_positive');
    }

    if (currency && !Object.values(Currency).includes(currency)) {
      throw new BadRequestException('finance.unsupported_currency');
    }

    // Currency-specific decimal precision (currently all supported currencies use 2 dp)
    const precision = 2;
    const decimalAmount = new Decimal(String(amount));
    if (!decimalAmount.toDecimalPlaces(precision).equals(decimalAmount)) {
      throw new BadRequestException(
        `finance.amount_precision_error: Maximum ${precision} decimal places allowed for ${currency || 'default currency'}`,
      );
    }

    // Maximum amount validation
    if (decimalAmount.greaterThan('999999999.99')) {
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

  /**
   * Transfers pending commission between users with deadlock prevention.
   */
  async transferPendingCommission(
    manager: EntityManager,
    oldUserId: string | null,
    newUserId: string | undefined,
    commissionAmount: number,
  ): Promise<void> {
    if (commissionAmount <= 0) return;

    // Fix: Deadlock Prevention.
    // We must acquire locks on the wallets in a deterministic order.
    // We'll create a list of updates to perform, sort them by userId, and execute.

    interface WalletUpdate {
      userId: string;
      action: 'subtract' | 'add';
    }

    const updates: WalletUpdate[] = [];

    if (oldUserId && oldUserId !== newUserId) {
      updates.push({ userId: oldUserId, action: 'subtract' });
    }

    if (newUserId) {
      updates.push({ userId: newUserId, action: 'add' });
    }

    // Sort by userId to ensure deterministic locking order
    updates.sort((a, b) => a.userId.localeCompare(b.userId));

    // Execute updates in order
    for (const update of updates) {
      if (update.action === 'subtract') {
        await this.walletService.subtractPendingCommission(manager, update.userId, commissionAmount);
      } else {
        await this.walletService.addPendingCommission(manager, update.userId, commissionAmount);
      }
    }
  }

  async findAllTransactions(filter?: TransactionFilterDto): Promise<Transaction[]> {
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

    return queryBuilder.orderBy('t.transactionDate', 'DESC').skip(filter?.getSkip()).take(filter?.getTake()).getMany();
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
        transactionDate: typedRow.t_transaction_date ? new Date(typedRow.t_transaction_date).toISOString() : '',
        createdAt: typedRow.t_created_at ? new Date(typedRow.t_created_at).toISOString() : '',
      };
    };

    await this.exportService.streamFromStream(
      res,
      queryStream,
      `transactions-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
      transformFn,
    );
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
      .addSelect('SUM(CAST(t.amount AS DECIMAL) * CAST(t.exchange_rate AS DECIMAL))', 'total')
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
      const amount = MathUtils.parseFinancialAmount(row.total);
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

    summary.netBalance = MathUtils.subtract(
      MathUtils.subtract(summary.totalIncome, summary.totalExpenses),
      summary.totalPayroll,
    );
    return summary;
  }
}
