import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { DataSource } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { FINANCE } from '../constants';
import { CreateRecurringTransactionDto, UpdateRecurringTransactionDto } from '../dto/recurring-transaction.dto';
import { RecurringStatus, RecurringTransaction } from '../entities/recurring-transaction.entity';
import { toRruleString } from '../utils/rrule-helper';
import { FinanceService } from './finance.service';

import { toErrorMessage } from '../../../common/utils/error.util';
import { RecurringTransactionRepository } from '../repositories/recurring-transaction.repository';

@Injectable()
export class RecurringTransactionService {
  private readonly logger = new Logger(RecurringTransactionService.name);
  /** Lock key for recurring transaction cron job */
  private static readonly CRON_LOCK_KEY = `${FINANCE.LOCK.RECURRING_TRANSACTION}:cron`;

  constructor(
    private readonly recurringRepo: RecurringTransactionRepository,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
    private readonly distributedLockService: DistributedLockService,
  ) {}

  async create(dto: CreateRecurringTransactionDto): Promise<RecurringTransaction> {
    const startDate = new Date(dto.startDate);
    const rt = this.recurringRepo.create({
      ...dto,
      nextRunDate: startDate,
      status: RecurringStatus.ACTIVE,
      rruleString: toRruleString(dto.frequency, dto.interval ?? 1, startDate),
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
    const limit = query.limit || 20;

    const qb = this.recurringRepo.createQueryBuilder('rt');

    return CursorPaginationHelper.paginate(qb, {
      cursor: query.cursor,
      limit,
      alias: 'rt',
    });
  }

  async findOne(id: string): Promise<RecurringTransaction> {
    const rt = await this.recurringRepo.findOne({ where: { id } });
    if (!rt) throw new NotFoundException('finance.recurring_not_found');
    return rt;
  }

  async update(id: string, dto: UpdateRecurringTransactionDto): Promise<RecurringTransaction> {
    const rt = await this.findOne(id);
    if (dto.name !== undefined) rt.name = dto.name;
    if (dto.type !== undefined) rt.type = dto.type;
    if (dto.amount !== undefined) rt.amount = dto.amount;
    if (dto.currency !== undefined) rt.currency = dto.currency;
    if (dto.category !== undefined) rt.category = dto.category;
    if (dto.department !== undefined) rt.department = dto.department;
    if (dto.description !== undefined) rt.description = dto.description;
    if (dto.frequency !== undefined) rt.frequency = dto.frequency;
    if (dto.interval !== undefined) rt.interval = dto.interval;
    if (dto.startDate !== undefined) rt.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) rt.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.maxOccurrences !== undefined) rt.maxOccurrences = dto.maxOccurrences;
    if (dto.notifyBeforeDays !== undefined) rt.notifyBeforeDays = dto.notifyBeforeDays;
    if (dto.status !== undefined) rt.status = dto.status;

    // Re-derive RRULE whenever a field that affects scheduling changes.
    if (dto.frequency !== undefined || dto.interval !== undefined || dto.startDate !== undefined) {
      rt.rruleString = toRruleString(rt.frequency, rt.interval, rt.startDate);
    }

    return this.recurringRepo.save(rt);
  }

  async remove(id: string): Promise<void> {
    const rt = await this.findOne(id);
    await this.recurringRepo.remove(rt);
  }

  @Cron('0 0 * * *')
  async processDueTransactions() {
    // Use Redis-based distributed lock for multi-replica deployments
    const result = await this.distributedLockService.withLock(
      RecurringTransactionService.CRON_LOCK_KEY,
      async () => {
        this.logger.log('Processing recurring transactions...');

        // Intentionally global query for cron - processes all tenants, each in its own context
        const dueTransactions = await this.dataSource
          .createQueryBuilder(RecurringTransaction, 'rt')
          .where('rt.status = :status', { status: RecurringStatus.ACTIVE })
          .andWhere('rt.nextRunDate <= :now', { now: new Date() })
          .take(FINANCE.BATCH.MAX_BATCH_SIZE)
          .getMany();

        // Use bounded concurrency to prevent resource exhaustion
        const limit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);
        const results = await Promise.allSettled(dueTransactions.map((rt) => limit(() => this.processTransaction(rt))));

        // Derive counts from per-transaction return values so that handled
        // failures (which save failureCount/lastError then return { ok: false })
        // are accurately counted rather than being swallowed as "fulfilled".
        const failed = results.filter(
          (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
        ).length;
        const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
        this.logger.log(
          `Processed ${dueTransactions.length} recurring transactions: ${succeeded} succeeded, ${failed} failed`,
        );

        return { total: dueTransactions.length, succeeded, failed };
      },
      {
        ttl: FINANCE.TIME.FIVE_MINUTES_MS, // 5 minute lock TTL for batch processing
        maxRetries: 0, // Don't retry - let next cron tick handle it
      },
    );

    if (result === null) {
      this.logger.log('Skipping recurring transactions - another instance holds the lock');
    }
  }

  private async processTransaction(rt: RecurringTransaction): Promise<{ ok: boolean }> {
    return TenantContextService.run(rt.tenantId, async () => {
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
        return { ok: true };
      } catch (error) {
        // Track failures to prevent infinite retry loops
        rt.failureCount = (rt.failureCount || 0) + 1;
        rt.lastError = toErrorMessage(error);

        // Mark as FAILED after 3 consecutive failures
        if (rt.failureCount >= 3) {
          rt.status = RecurringStatus.FAILED;
          this.logger.error(`Recurring transaction ${rt.id} permanently failed after 3 attempts: ${rt.lastError}`);
        }

        await this.recurringRepo.save(rt);
        this.logger.error(`Failed to process recurring transaction ${rt.id} (attempt ${rt.failureCount})`, error);
        return { ok: false };
      }
    });
  }
}
