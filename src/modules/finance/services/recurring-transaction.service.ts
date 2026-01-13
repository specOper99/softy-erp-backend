import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateRecurringTransactionDto, UpdateRecurringTransactionDto } from '../dto/recurring-transaction.dto';
import { RecurringStatus, RecurringTransaction } from '../entities/recurring-transaction.entity';
import { FinanceService } from './finance.service';

import { RecurringTransactionRepository } from '../repositories/recurring-transaction.repository';

@Injectable()
export class RecurringTransactionService {
  private readonly logger = new Logger(RecurringTransactionService.name);
  // Deterministic lock ID for pg_advisory_lock
  private static readonly CRON_LOCK_ID = 928374651; // Hash of 'recurring_cron'

  constructor(
    private readonly recurringRepo: RecurringTransactionRepository,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateRecurringTransactionDto): Promise<RecurringTransaction> {
    const rt = this.recurringRepo.create({
      ...dto,
      nextRunDate: new Date(dto.startDate),
      status: RecurringStatus.ACTIVE,
    });
    return this.recurringRepo.save(rt);
  }

  async findAll(query: PaginationDto): Promise<RecurringTransaction[]> {
    return this.recurringRepo.find({
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: RecurringTransaction[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantId();
    const limit = query.limit || 20;

    const qb = this.recurringRepo.createQueryBuilder('rt');

    qb.where('rt.tenantId = :tenantId', { tenantId })
      .orderBy('rt.createdAt', 'DESC')
      .addOrderBy('rt.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
      const [dateStr, id] = decoded.split('|');
      const date = new Date(dateStr);

      qb.andWhere('(rt.createdAt < :date OR (rt.createdAt = :date AND rt.id < :id))', { date, id });
    }

    const transactions = await qb.getMany();
    let nextCursor: string | null = null;

    if (transactions.length > limit) {
      transactions.pop();
      const lastItem = transactions[transactions.length - 1];
      const cursorData = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return { data: transactions, nextCursor };
  }

  async findOne(id: string): Promise<RecurringTransaction> {
    const rt = await this.recurringRepo.findOne({ where: { id } });
    if (!rt) throw new NotFoundException('Recurring transaction not found');
    return rt;
  }

  async update(id: string, dto: UpdateRecurringTransactionDto): Promise<RecurringTransaction> {
    const rt = await this.findOne(id);
    Object.assign(rt, dto);
    return this.recurringRepo.save(rt);
  }

  async remove(id: string): Promise<void> {
    const rt = await this.findOne(id);
    await this.recurringRepo.remove(rt);
  }

  @Cron('0 0 * * *')
  async processDueTransactions() {
    // Use PostgreSQL advisory lock for distributed lock in multi-replica deployments
    const lockId = RecurringTransactionService.CRON_LOCK_ID;
    const result = await this.dataSource.query<{ acquired: boolean }[]>('SELECT pg_try_advisory_lock($1) as acquired', [
      lockId,
    ]);
    const acquired = result[0]?.acquired;

    if (!acquired) {
      this.logger.log('Skipping recurring transactions - another instance holds the lock');
      return;
    }

    try {
      this.logger.log('Processing recurring transactions...');

      const dueTransactions = await this.recurringRepo.find({
        where: {
          status: RecurringStatus.ACTIVE,
          nextRunDate: LessThanOrEqual(new Date()),
        },
        take: 1000,
      });

      const BATCH_SIZE = 5;
      for (let i = 0; i < dueTransactions.length; i += BATCH_SIZE) {
        const batch = dueTransactions.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((rt) => this.processTransaction(rt)));
      }

      this.logger.log(`Processed ${dueTransactions.length} recurring transactions`);
    } finally {
      // Always release the lock
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  }

  private async processTransaction(rt: RecurringTransaction) {
    try {
      await this.financeService.createSystemTransaction(rt.tenantId, {
        type: rt.type,
        amount: Number(rt.amount),
        currency: rt.currency,
        category: rt.category,
        department: rt.department,
        description: `${rt.description || rt.name} (Recurring #${rt.runCount + 1})`,
        transactionDate: new Date().toISOString(),
      });

      rt.lastRunDate = new Date();
      rt.runCount += 1;
      rt.nextRunDate = rt.calculateNextRunDate();
      rt.failureCount = 0; // Reset failure count on success
      rt.lastError = undefined;

      if (rt.isComplete()) {
        rt.status = RecurringStatus.COMPLETED;
      }

      await this.recurringRepo.save(rt);
    } catch (error) {
      // Track failures to prevent infinite retry loops
      rt.failureCount = (rt.failureCount || 0) + 1;
      rt.lastError = error instanceof Error ? error.message : String(error);

      // Mark as FAILED after 3 consecutive failures
      if (rt.failureCount >= 3) {
        rt.status = RecurringStatus.FAILED;
        this.logger.error(`Recurring transaction ${rt.id} permanently failed after 3 attempts: ${rt.lastError}`);
      }

      await this.recurringRepo.save(rt);
      this.logger.error(`Failed to process recurring transaction ${rt.id} (attempt ${rt.failureCount})`, error);
    }
  }
}
