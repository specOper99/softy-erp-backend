import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import Decimal from 'decimal.js';
import type { Response } from 'express';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';

import { TenantsService } from '../../tenants/tenants.service';
import { CreateTransactionDto, TransactionCursorQueryDto, TransactionFilterDto } from '../dto';
import { Transaction } from '../entities/transaction.entity';
import { Currency } from '../enums/currency.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionCreatedEvent } from '../events/transaction-created.event';
import { TransactionRepository } from '../repositories/transaction.repository';
import { allowsNegativeIncomeForRefundOrReversal } from '../utils/transaction-rule.util';
import { CurrencyService } from './currency.service';
import { FinancialReportService } from './financial-report.service';
import { WalletService } from './wallet.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly currencyService: CurrencyService,
    private readonly tenantsService: TenantsService,
    private readonly exportService: ExportService,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly financialReportService: FinancialReportService,
    private readonly eventBus: EventBus,
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
    const preparedData = await this.validateAndPrepareTransactionData(tenantId, {
      type: dto.type,
      amount: dto.amount,
      currency: dto.currency,
      category: dto.category,
      department: dto.department,
      bookingId: dto.bookingId,
      taskId: dto.taskId,
      payoutId: dto.payoutId,
      description: dto.description,
      paymentMethod: dto.paymentMethod,
      reference: dto.reference,
      transactionDate: new Date(dto.transactionDate),
    });

    const transaction = this.transactionRepository.create(preparedData);
    const savedTransaction = await this.transactionRepository.save(transaction);

    this.publishTransactionCreatedEvent(tenantId, savedTransaction);

    // Invalidate financial report caches (data has changed)
    await this.financialReportService.invalidateReportCaches(tenantId);

    return savedTransaction;
  }

  /**
   * Validates and prepares transaction data with comprehensive checks.
   * This method is used by all transaction creation paths to ensure consistency.
   * @private
   */
  private async validateAndPrepareTransactionData(
    tenantId: string,
    data: {
      type: TransactionType;
      amount: number;
      currency?: Currency;
      category?: string;
      department?: string;
      bookingId?: string;
      taskId?: string;
      payoutId?: string;
      description?: string;
      paymentMethod?: string;
      reference?: string;
      transactionDate: Date;
    },
  ): Promise<{
    type: TransactionType;
    amount: number;
    currency: Currency;
    exchangeRate: number;
    category?: string;
    department?: string;
    bookingId?: string;
    taskId?: string;
    payoutId?: string;
    description?: string;
    paymentMethod?: string;
    reference?: string;
    transactionDate: Date;
    tenantId: string;
  }> {
    // Validate transaction amount with comprehensive checks
    this.validateTransactionAmount(data);

    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) {
      throw new NotFoundException({
        code: 'platform.tenant_not_found',
        args: { tenantId },
      });
    }

    const currency = data.currency || tenant.baseCurrency;
    const exchangeRate = this.currencyService.getExchangeRate(currency, tenant.baseCurrency);

    // Round amount to 2 decimal places for precision using safe math
    const roundedAmount = MathUtils.round(data.amount, 2);

    return {
      type: data.type,
      amount: roundedAmount,
      currency,
      exchangeRate,
      category: data.category,
      department: data.department,
      bookingId: data.bookingId,
      taskId: data.taskId,
      payoutId: data.payoutId,
      description: data.description,
      paymentMethod: data.paymentMethod,
      reference: data.reference,
      transactionDate: data.transactionDate,
      tenantId,
    };
  }

  /**
   * Validates transaction amount with comprehensive checks for financial operations.
   * Prevents fraud, rounding errors, and data corruption.
   */
  private validateTransactionAmount(data: {
    type: TransactionType;
    amount: number;
    currency?: Currency;
    category?: string;
    bookingId?: string;
  }): void {
    const { amount, currency, type, category, bookingId } = data;

    // Must be a valid finite number
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('finance.amount_must_be_valid_number');
    }

    if (amount === 0) {
      throw new BadRequestException('finance.amount_must_be_positive');
    }

    if (amount < 0) {
      if (!allowsNegativeIncomeForRefundOrReversal({ type, category, bookingId })) {
        throw new BadRequestException('finance.amount_must_be_positive');
      }
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
    if (decimalAmount.abs().greaterThan('999999999.99')) {
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
      revenueAccountCode?: string;
      paymentMethod?: string;
      reference?: string;
    },
  ): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // SECURITY FIX: Enforce validation for all transaction creation paths
    // This prevents invalid transactions (negative amounts, invalid currencies, etc.)
    const preparedData = await this.validateAndPrepareTransactionData(tenantId, data);

    const transaction = manager.create(Transaction, {
      ...preparedData,
      revenueAccountCode: data.revenueAccountCode ?? null,
      paymentMethod: data.paymentMethod ?? null,
      reference: data.reference ?? null,
    });
    const savedTransaction = await manager.save(transaction);

    // NOTE: Side effects (event publishing and cache invalidation) are intentionally
    // omitted here. This method runs inside a caller-supplied transaction that may not
    // have committed yet. Callers are responsible for invoking
    // notifyTransactionCreated() after their transaction commits successfully.

    return savedTransaction;
  }

  /**
   * Publish the TransactionCreatedEvent and invalidate report caches.
   * MUST be called after the enclosing database transaction has committed.
   */
  async notifyTransactionCreated(savedTransaction: Transaction, reversalOfId?: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    this.publishTransactionCreatedEvent(tenantId, savedTransaction, reversalOfId);
    await this.financialReportService.invalidateReportCaches(tenantId);
  }

  private publishTransactionCreatedEvent(tenantId: string, transaction: Transaction, reversalOfId?: string): void {
    this.eventBus.publish(
      new TransactionCreatedEvent(
        transaction.id,
        tenantId,
        transaction.type,
        transaction.amount,
        transaction.currency,
        transaction.exchangeRate,
        transaction.category ?? undefined,
        transaction.bookingId ?? undefined,
        transaction.taskId ?? undefined,
        transaction.payoutId ?? undefined,
        transaction.description ?? undefined,
        transaction.transactionDate,
        transaction.createdAt,
        reversalOfId,
      ),
    );
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

  async findTransactionsByBookingId(bookingId: string, tenantId: string): Promise<Transaction[]> {
    return this.transactionRepository
      .createQueryBuilder('t')
      .where('t.bookingId = :bookingId', { bookingId })
      .andWhere('t.tenantId = :tenantId', { tenantId })
      .orderBy('t.transactionDate', 'DESC')
      .getMany();
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

    if (filter?.bookingId) {
      queryBuilder.andWhere('t.bookingId = :bookingId', { bookingId: filter.bookingId });
    }

    return queryBuilder.orderBy('t.transactionDate', 'DESC').skip(filter?.getSkip()).take(filter?.getTake()).getMany();
  }

  async findAllTransactionsCursor(
    query: TransactionCursorQueryDto,
  ): Promise<{ data: Transaction[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const qb = this.transactionRepository.createQueryBuilder('t');
    qb.where('t.tenantId = :tenantId', { tenantId });

    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }

    if (query.startDate && query.endDate) {
      qb.andWhere('t.transactionDate BETWEEN :start AND :end', {
        start: new Date(query.startDate),
        end: new Date(query.endDate),
      });
    }

    if (query.bookingId) {
      qb.andWhere('t.bookingId = :bookingId', { bookingId: query.bookingId });
    }

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
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException({
        code: 'finance.transaction_not_found',
        args: { id },
      });
    }
    return transaction;
  }

  async voidTransaction(id: string, reason?: string, currentUserId?: string | null): Promise<Transaction> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const resolvedUserId = currentUserId ?? TenantContextService.getCurrentUserIdOrNull() ?? null;

    let savedReversal: Transaction;
    try {
      savedReversal = await this.dataSource.transaction(async (manager) => {
        // Lock the original row to prevent concurrent void attempts.
        const original = await manager.findOne(Transaction, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!original) {
          throw new NotFoundException({
            code: 'finance.transaction_not_found',
            args: { id },
          });
        }

        // Refuse to void an already-voided transaction.
        if (original.voidedAt !== null) {
          throw new ConflictException('finance.transaction_already_voided');
        }

        // Refuse to void a reversal (would create a reversal-of-a-reversal).
        if (original.reversalOfId !== null) {
          throw new ConflictException('finance.cannot_void_a_reversal');
        }

        const description = reason
          ? `Void: ${reason} — reversal of transaction ${id}`
          : `Reversal of transaction ${id}`;

        const reversal = manager.create(Transaction, {
          tenantId,
          type: original.type,
          amount: -original.amount,
          currency: original.currency,
          exchangeRate: original.exchangeRate,
          category: 'REVERSAL',
          categoryId: original.categoryId,
          bookingId: original.bookingId,
          taskId: original.taskId,
          payoutId: original.payoutId,
          paymentMethod: original.paymentMethod,
          reference: original.reference,
          department: original.department,
          revenueAccountCode: original.revenueAccountCode,
          description,
          transactionDate: new Date(),
          reversalOfId: original.id,
        });

        const saved = await manager.save(reversal);

        // Mark original as voided.
        await manager.update(
          Transaction,
          { id: original.id, tenantId },
          {
            voidedAt: new Date(),
            voidedBy: resolvedUserId,
          },
        );

        return saved;
      });
    } catch (error) {
      // Unique partial index violation — concurrent void attempt won the race.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException('finance.transaction_already_voided');
      }
      throw error;
    }

    // Side effects run after the transaction has committed, so downstream
    // listeners and caches never observe data that may still roll back.
    this.publishTransactionCreatedEvent(tenantId, savedReversal, id);
    await this.financialReportService.invalidateReportCaches(tenantId);

    return savedReversal;
  }

  async exportTransactionsToCSV(res: Response): Promise<void> {
    // SECURITY FIX: Use tenant-scoped stream query builder to prevent cross-tenant data leakage
    const queryStream = await this.transactionRepository
      .createStreamQueryBuilder('t')
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
