import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { FINANCE } from '../constants';
import { CreateRecurringTransactionDto, UpdateRecurringTransactionDto } from '../dto/recurring-transaction.dto';
import { RecurringStatus, RecurringTransaction } from '../entities/recurring-transaction.entity';
import { FinanceService } from './finance.service';

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
    // Use Redis-based distributed lock for multi-replica deployments
    const result = await this.distributedLockService.withLock(
      RecurringTransactionService.CRON_LOCK_KEY,
      async () => {
        this.logger.log('Processing recurring transactions...');

        // Intentionally global query for cron - processes all tenants, each in its own context
        // eslint-disable-next-line local-rules/no-unsafe-tenant-context
        const dueTransactions = await this.dataSource.getRepository(RecurringTransaction).find({
          where: {
            status: RecurringStatus.ACTIVE,
            nextRunDate: LessThanOrEqual(new Date()),
          },
          take: FINANCE.BATCH.MAX_BATCH_SIZE,
        });

        // Use bounded concurrency to prevent resource exhaustion
        const limit = pLimit(FINANCE.BATCH.MAX_CONCURRENCY);
        const results = await Promise.allSettled(dueTransactions.map((rt) => limit(() => this.processTransaction(rt))));

        // Log summary
        const failed = results.filter((r) => r.status === 'rejected').length;
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
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

  private async processTransaction(rt: RecurringTransaction) {
    await TenantContextService.run(rt.tenantId, async () => {
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
    });
  }
}
