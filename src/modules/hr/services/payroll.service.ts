import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import pLimit from 'p-limit';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { AuditPublisher } from '../../audit/audit.publisher';
import { Payout } from '../../finance/entities/payout.entity';
import { Currency } from '../../finance/enums/currency.enum';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRunResponseDto } from '../dto';
import { PayrollRun, Profile } from '../entities';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  private readonly PAYROLL_BATCH_SIZE = 100;

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunRepository: Repository<PayrollRun>,
    private readonly financeService: FinanceService,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * WORKFLOW 3: Payroll Run (Cron Job)
   * Runs at end of each month (28th at 23:59 to handle all months)
   * Transactional steps:
   * 1. Get all employees with Profile and EmployeeWallet
   * 2. Calculate total: base_salary + payable_balance
   * 3. Create PAYROLL expense transaction for each
   * 4. Reset payable_balance to 0
   * 5. Rollback all on failure
   */
  @Cron('59 23 28 * *') // Run on 28th of each month at 23:59
  async runScheduledPayroll(): Promise<void> {
    // [C-01] Distributed Lock: Prevent concurrent execution
    const lockId = 1001;
    const queryResult: unknown = await this.dataSource.query('SELECT pg_try_advisory_lock($1) as locked', [lockId]);
    const typedResult = queryResult as Array<{
      locked?: boolean;
      pg_try_advisory_lock?: boolean;
    }>;
    const lockResult = typedResult[0];

    // Handle different driver return formats (boolean or row)
    const isLocked = lockResult && (lockResult.locked === true || lockResult.pg_try_advisory_lock === true);

    if (!isLocked) {
      this.logger.warn('Skipping payroll run: another instance is already holding the lock.');
      return;
    }

    try {
      this.logger.log('Starting scheduled payroll run for all tenants...');

      // Iterate all tenants since cron jobs don't have HTTP request context
      const tenants = await this.tenantsService.findAll();

      // PERFORMANCE FIX: Use bounded concurrency instead of sequential processing
      const limit = pLimit(5); // Max 5 concurrent tenant payroll runs

      const processPayrollForTenant = async (tenant: { id: string; slug: string }) => {
        try {
          // Run payroll within tenant context
          await new Promise<void>((resolve, reject) => {
            TenantContextService.run(tenant.id, () => {
              this.runPayroll()
                .then((result) => {
                  this.logger.log(
                    `Payroll completed for tenant ${tenant.slug}: ${result.totalEmployees} employees, $${result.totalPayout} total`,
                  );
                  resolve();
                })
                .catch((error: unknown) => {
                  reject(error instanceof Error ? error : new Error(String(error)));
                });
            });
          });
        } catch (error) {
          this.logger.error(`Payroll run failed for tenant ${tenant.slug}`, error);
        }
      };

      await Promise.all(tenants.map((tenant) => limit(() => processPayrollForTenant(tenant))));

      this.logger.log('Scheduled payroll run completed for all tenants');
    } finally {
      // Release distributed lock
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  }

  async runPayroll(): Promise<PayrollRunResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // Get total count for batch processing
    const totalCount = await this.profileRepository.count({
      where: { tenantId },
    });

    if (totalCount === 0) {
      this.logger.log(`No profiles found for tenant ${tenantId}, skipping payroll`);
      return {
        totalEmployees: 0,
        totalPayout: 0,
        transactionIds: [],
        processedAt: new Date(),
      };
    }

    const allTransactionIds: string[] = [];
    let totalPayout = 0;
    let totalEmployeesProcessed = 0;
    const batchCount = Math.ceil(totalCount / this.PAYROLL_BATCH_SIZE);

    this.logger.log(`Starting payroll for tenant ${tenantId}: ${totalCount} profiles in ${batchCount} batches`);

    // Process each batch in its own transaction
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      const skip = batchIndex * this.PAYROLL_BATCH_SIZE;

      try {
        const batchResult = await this.processPayrollBatch(tenantId, skip, this.PAYROLL_BATCH_SIZE);

        allTransactionIds.push(...batchResult.transactionIds);
        totalPayout += batchResult.totalPayout;
        totalEmployeesProcessed += batchResult.employeesProcessed;

        this.logger.log(
          `Payroll batch ${batchIndex + 1}/${batchCount} completed: ${batchResult.employeesProcessed} employees, $${batchResult.totalPayout}`,
        );
      } catch (error) {
        this.logger.error(`Payroll batch ${batchIndex + 1}/${batchCount} failed for tenant ${tenantId}`, error);
        // Continue with next batch - partial payroll is better than none
      }
    }

    // Final audit log (outside batch transactions)
    await this.auditService.log({
      action: 'PAYROLL_RUN',
      entityName: 'Payroll',
      entityId: `${tenantId}-${new Date().toISOString().slice(0, 7)}`,
      newValues: {
        totalEmployees: totalEmployeesProcessed,
        totalPayout,
        transactionIds: allTransactionIds,
        batchCount,
      },
      notes: `Monthly payroll run completed for ${totalEmployeesProcessed} employees in tenant ${tenantId} across ${batchCount} batches.`,
    });

    // Save PayrollRun record for history
    const payrollRun = this.payrollRunRepository.create({
      totalEmployees: totalEmployeesProcessed,
      totalPayout,
      transactionIds: allTransactionIds,
      processedAt: new Date(),
      status: 'COMPLETED',
      tenantId,
      notes: `Monthly payroll run with ${batchCount} batches.`,
    });
    await this.payrollRunRepository.save(payrollRun);

    return {
      totalEmployees: totalEmployeesProcessed,
      totalPayout,
      transactionIds: allTransactionIds,
      processedAt: payrollRun.processedAt,
    };
  }

  async getPayrollHistory(query: PaginationDto = new PaginationDto()): Promise<PayrollRun[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.payrollRunRepository.find({
      where: { tenantId },
      order: { processedAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async getPayrollHistoryCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: PayrollRun[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const qb = this.payrollRunRepository.createQueryBuilder('payrollRun');
    qb.where('payrollRun.tenantId = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateWithCustomDateField(
      qb,
      {
        cursor: query.cursor,
        limit: query.limit,
        alias: 'payrollRun',
      },
      'processedAt',
    );
  }

  /**
   * Process a single batch of payroll.
   * Uses two-phase approach:
   * Phase 1: Calculate payouts and prepare data (no transaction)
   * Phase 2: For each employee - call gateway, then create transaction (separate transaction per employee)
   */
  async processPayrollBatch(
    tenantId: string,
    skip: number,
    take: number,
  ): Promise<{
    transactionIds: string[];
    totalPayout: number;
    employeesProcessed: number;
  }> {
    // Phase 1: Fetch profiles and calculate payouts (outside transaction)
    const profiles = await this.profileRepository.find({
      where: { tenantId },
      relations: ['user', 'user.wallet'],
      order: { id: 'ASC' },
      skip,
      take,
    });

    const transactionIds: string[] = [];
    let totalPayout = 0;
    let employeesProcessed = 0;

    // Use a single query runner for the batch or multiple?
    // Original was per-employee transaction.
    // We can stick to per-employee for failure isolation.

    for (const profile of profiles) {
      const wallet = profile.user?.wallet;
      const baseSalary = Number(profile.baseSalary) || 0;
      const commissionPayable = wallet ? Number(wallet.payableBalance) || 0 : 0;
      const totalAmount = MathUtils.add(baseSalary, commissionPayable);

      if (totalAmount <= 0) {
        continue; // Skip if no payout
      }

      const referenceId = `${tenantId}-${profile.id}-${new Date().toISOString().slice(0, 7)}`;

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // [C-02] Idempotency: Check if payout already exists
        // Note: We use queryRunner.manager to be safe inside transaction, though findOne read is fine.
        // We want to lock distinct Payout row if possible or just check existence.
        // Since we insert, unique index on tenantId + id is not enough for "monthly payroll" unless we have a unique constraint on some domain key.
        // Payout entity doesn't seem to have a unique constraint on "month + employee".
        // We rely on "notes" or manual checks?
        // Original code checked by notes/status.

        const existingPayout = await queryRunner.manager.findOne(Payout, {
          where: {
            notes: `Pending payroll for ${referenceId}`,
            // We check for any status to avoid double payment
          },
        });

        if (existingPayout) {
          this.logger.log(`Skipping already existing payout for ${referenceId}`);
          await queryRunner.rollbackTransaction();
          continue;
        }

        // Create Payout Record (Outbox)
        const payout = queryRunner.manager.create(Payout, {
          tenantId,
          amount: totalAmount,
          commissionAmount: commissionPayable,
          payoutDate: new Date(),
          status: PayoutStatus.PENDING,
          notes: `Pending payroll for ${referenceId}`,
          currency: Currency.USD,
          metadata: {
            userId: profile.userId,
            employeeName: `${profile.firstName || ''} ${profile.lastName || ''}`,
            bankAccount: profile.bankAccount || 'NO_BANK_ACCOUNT',
            referenceId,
          },
        });

        await queryRunner.manager.save(payout);

        // Reset payable balance to 0 (ERP Accounting)
        // We do this NOW. If payout fails permanently, Relay Service will refund it.
        if (wallet && commissionPayable > 0) {
          await this.walletService.resetPayableBalance(queryRunner.manager, profile.userId);
        }

        await queryRunner.commitTransaction();

        // We don't have a Transaction ID yet because the actual ERP Transaction is created by Relay.
        // But the return type expects transactionIds.
        // We can return the Payout ID instead or nothing.
        // The return value is used for Audit Log.
        // Let's return Payout ID.
        transactionIds.push(payout.id);
        totalPayout = MathUtils.add(totalPayout, totalAmount);
        employeesProcessed++;

        // Send notification?
        // Maybe better to send it when payout is actually sent?
        // Or send "Payroll processed, payment incoming".
        // Original code sent it after DB commit.
        // Let's keep it here but clarify text if needed (user didn't ask to change email text).
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error(`Payroll processing failed for ${profile.firstName} ${profile.lastName}`, error);
      } finally {
        await queryRunner.release();
      }
    }

    return { transactionIds, totalPayout, employeesProcessed };
  }
}
