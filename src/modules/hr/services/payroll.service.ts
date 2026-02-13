import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { DataSource } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DistributedLockService } from '../../../common/services/distributed-lock.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CursorPaginationHelper } from '../../../common/utils/cursor-pagination.helper';
import { MathUtils } from '../../../common/utils/math.utils';
import { TenantScopedManager } from '../../../common/utils/tenant-scoped-manager';
import { AuditPublisher } from '../../audit/audit.publisher';
import { Payout } from '../../finance/entities/payout.entity';
import { Transaction } from '../../finance/entities/transaction.entity';
import { Currency } from '../../finance/enums/currency.enum';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRunResponseDto } from '../dto';
import { PayrollRun } from '../entities';
import { PayrollRunRepository } from '../repositories/payroll-run.repository';
import { ProfileRepository } from '../repositories/profile.repository';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  private readonly PAYROLL_BATCH_SIZE = 100;

  private readonly tenantTx: TenantScopedManager;

  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly payrollRunRepository: PayrollRunRepository,
    private readonly financeService: FinanceService,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
    private readonly auditService: AuditPublisher,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly distributedLockService: DistributedLockService,
  ) {
    this.tenantTx = new TenantScopedManager(dataSource);
  }

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
    // Use Redis-based distributed lock instead of unsafe PostgreSQL advisory locks
    const result = await this.distributedLockService.withLock(
      'payroll:scheduled-run',
      async () => {
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
                  .then((payrollResult) => {
                    this.logger.log(
                      `Payroll completed for tenant ${tenant.slug}: ${payrollResult.totalEmployees} employees, $${payrollResult.totalPayout} total`,
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
        return { success: true };
      },
      { ttl: 300000 }, // 5 minute TTL for long-running payroll
    );

    if (!result) {
      this.logger.warn('Skipping payroll run: another instance is already holding the lock.');
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
    return this.payrollRunRepository.find({
      where: {},
      order: { processedAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async getPayrollHistoryCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: PayrollRun[]; nextCursor: string | null }> {
    const qb = this.payrollRunRepository.createQueryBuilder('payrollRun');

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

    const limit = pLimit(5);

    await Promise.allSettled(
      profiles.map((profile) =>
        limit(async () => {
          const baseSalary = Number(profile.baseSalary) || 0;

          const payrollMonth = new Date().toISOString().slice(0, 7);
          const referenceId = `${tenantId}-${profile.id}-${payrollMonth}`;
          const idempotencyKey = `payroll:${tenantId}:${profile.id}:${payrollMonth}`;

          try {
            const result = await this.tenantTx.run(async (manager) => {
              const wallet = await this.walletService.getOrCreateWalletWithManager(manager, profile.userId);

              const commissionPayable = wallet ? Number(wallet.payableBalance) || 0 : 0;
              const totalAmount = MathUtils.add(baseSalary, commissionPayable);

              if (totalAmount <= 0) {
                return null; // Skip this employee
              }

              const existingPayout = await manager.findOne(Payout, {
                where: {
                  tenantId,
                  idempotencyKey,
                },
              });

              if (existingPayout) {
                this.logger.log(`Skipping already existing payout for ${idempotencyKey}`);
                return null; // Skip this employee
              }

              const payout = manager.create(Payout, {
                tenantId,
                idempotencyKey,
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

              await manager.save(payout);

              // Create corresponding transaction record for the payout
              const transaction = manager.create(Transaction, {
                tenantId,
                type: TransactionType.PAYROLL,
                currency: Currency.USD,
                exchangeRate: 1.0,
                amount: totalAmount,
                category: 'Payroll',
                department: profile.department || 'Operations',
                payoutId: payout.id,
                description: `Payroll payout for ${profile.firstName || ''} ${profile.lastName || ''}`,
                transactionDate: new Date(),
              });

              await manager.save(transaction);

              if (wallet && commissionPayable > 0) {
                await this.walletService.resetPayableBalance(manager, profile.userId);
              }

              return { transaction, totalAmount };
            });

            if (result) {
              transactionIds.push(result.transaction.id);
              totalPayout = MathUtils.add(totalPayout, result.totalAmount);
              employeesProcessed++;
            }
          } catch (error) {
            this.logger.error(`Payroll processing failed for ${profile.firstName} ${profile.lastName}`, error);
            // Continue with next employee - partial payroll is better than none
          }
        }),
      ),
    );

    return { transactionIds, totalPayout, employeesProcessed };
  }
}
