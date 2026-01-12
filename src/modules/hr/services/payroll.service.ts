import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import pLimit from 'p-limit';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { AuditService } from '../../audit/audit.service';
import { Payout } from '../../finance/entities/payout.entity';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import { PayrollRunResponseDto } from '../dto';
import { PayrollRun, Profile } from '../entities';
import { MockPaymentGatewayService } from './payment-gateway.service';

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
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly paymentGatewayService: MockPaymentGatewayService,
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
    const queryResult: unknown = await this.dataSource.query(
      'SELECT pg_try_advisory_lock($1) as locked',
      [lockId],
    );
    const typedResult = queryResult as Array<{
      locked?: boolean;
      pg_try_advisory_lock?: boolean;
    }>;
    const lockResult = typedResult[0];

    // Handle different driver return formats (boolean or row)
    const isLocked =
      lockResult &&
      (lockResult.locked === true || lockResult.pg_try_advisory_lock === true);

    if (!isLocked) {
      this.logger.warn(
        'Skipping payroll run: another instance is already holding the lock.',
      );
      return;
    }

    try {
      this.logger.log('Starting scheduled payroll run for all tenants...');

      // Iterate all tenants since cron jobs don't have HTTP request context
      const tenants = await this.tenantsService.findAll();

      // PERFORMANCE FIX: Use bounded concurrency instead of sequential processing
      const limit = pLimit(5); // Max 5 concurrent tenant payroll runs

      const processPayrollForTenant = async (tenant: {
        id: string;
        slug: string;
      }) => {
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
                  reject(
                    error instanceof Error ? error : new Error(String(error)),
                  );
                });
            });
          });
        } catch (error) {
          this.logger.error(
            `Payroll run failed for tenant ${tenant.slug}`,
            error,
          );
        }
      };

      await Promise.all(
        tenants.map((tenant) => limit(() => processPayrollForTenant(tenant))),
      );

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
      this.logger.log(
        `No profiles found for tenant ${tenantId}, skipping payroll`,
      );
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

    this.logger.log(
      `Starting payroll for tenant ${tenantId}: ${totalCount} profiles in ${batchCount} batches`,
    );

    // Process each batch in its own transaction
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      const skip = batchIndex * this.PAYROLL_BATCH_SIZE;

      try {
        const batchResult = await this.processPayrollBatch(
          tenantId,
          skip,
          this.PAYROLL_BATCH_SIZE,
        );

        allTransactionIds.push(...batchResult.transactionIds);
        totalPayout += batchResult.totalPayout;
        totalEmployeesProcessed += batchResult.employeesProcessed;

        this.logger.log(
          `Payroll batch ${batchIndex + 1}/${batchCount} completed: ${batchResult.employeesProcessed} employees, $${batchResult.totalPayout}`,
        );
      } catch (error) {
        this.logger.error(
          `Payroll batch ${batchIndex + 1}/${batchCount} failed for tenant ${tenantId}`,
          error,
        );
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

  async getPayrollHistory(
    query: PaginationDto = new PaginationDto(),
  ): Promise<PayrollRun[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.payrollRunRepository.find({
      where: { tenantId },
      order: { processedAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  /**
   * Process a single batch of payroll.
   * Uses two-phase approach:
   * Phase 1: Calculate payouts and prepare data (no transaction)
   * Phase 2: For each employee - call gateway, then create transaction (separate transaction per employee)
   */
  private async processPayrollBatch(
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

    // Phase 2: Process each employee (external API call + transaction per employee)
    for (const profile of profiles) {
      const wallet = profile.user?.wallet;
      const baseSalary = Number(profile.baseSalary) || 0;
      const commissionPayable = wallet ? Number(wallet.payableBalance) || 0 : 0;
      // [Refactor] Use MathUtils for precision
      const totalAmount = MathUtils.add(baseSalary, commissionPayable);

      if (totalAmount <= 0) {
        continue; // Skip if no payout
      }

      const referenceId = `${tenantId}-${profile.id}-${new Date().toISOString().slice(0, 7)}`;

      try {
        // [C-02] Idempotency: Create PENDING payout state BEFORE external call
        const payoutRepository = this.dataSource.getRepository(Payout);

        // Look for an existing pending payout for this reference
        let payout = await payoutRepository.findOne({
          where: {
            status: PayoutStatus.PENDING,
            notes: `Pending payroll for ${referenceId}`,
          },
        });

        if (!payout) {
          payout = payoutRepository.create({
            tenantId,
            amount: totalAmount,
            payoutDate: new Date(),
            status: PayoutStatus.PENDING,
            notes: `Pending payroll for ${referenceId}`,
          });
          await payoutRepository.save(payout);
        } else if (payout.status === (PayoutStatus.COMPLETED as unknown)) {
          this.logger.log(
            `Skipping already completed payout for ${referenceId}`,
          );
          continue;
        }

        // Step 1: Call payment gateway OUTSIDE transaction
        const gatewayResult = await this.paymentGatewayService.triggerPayout({
          employeeName: `${profile.firstName || ''} ${profile.lastName || ''}`,
          bankAccount: profile.bankAccount || 'NO_BANK_ACCOUNT',
          amount: totalAmount,
          referenceId,
        });

        if (!gatewayResult.success) {
          this.logger.warn(
            `Payment gateway failed for ${profile.firstName} ${profile.lastName}: ${gatewayResult.error}`,
          );
          // Mark as failed
          payout.status = PayoutStatus.FAILED;
          await payoutRepository.save(payout);
          continue;
        }

        // Step 2: Create transaction AFTER gateway succeeds (in its own transaction)
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          // Update Payout record to COMPLETED
          payout.status = PayoutStatus.COMPLETED;
          payout.notes = `Monthly payroll for ${profile.firstName || ''} ${profile.lastName || ''} | TxnRef: ${gatewayResult.transactionReference}`;
          await queryRunner.manager.save(payout);

          // Create PAYROLL transaction (ERP bookkeeping)
          const transaction =
            await this.financeService.createTransactionWithManager(
              queryRunner.manager,
              {
                type: TransactionType.PAYROLL,
                amount: totalAmount,
                category: 'Monthly Payroll',
                payoutId: payout.id,
                description: `Payroll for ${profile.firstName || ''} ${profile.lastName || ''}: Salary $${baseSalary} + Commission $${commissionPayable}`,
                transactionDate: new Date(),
              },
            );

          // Reset payable balance to 0
          if (wallet && commissionPayable > 0) {
            await this.walletService.resetPayableBalance(
              queryRunner.manager,
              profile.userId,
            );
          }

          await queryRunner.commitTransaction();

          transactionIds.push(transaction.id);
          totalPayout = MathUtils.add(totalPayout, totalAmount);
          employeesProcessed++;

          // Send payroll notification email (async, fire-and-forget)
          if (profile.user?.email) {
            this.mailService
              .sendPayrollNotification({
                employeeName: `${profile.firstName} ${profile.lastName}`,
                employeeEmail: profile.user.email,
                baseSalary: baseSalary,
                commission: commissionPayable,
                totalPayout: totalAmount,
                payrollDate: new Date(),
              })
              .catch((err) =>
                this.logger.error(
                  `Failed to send payroll email to ${profile.user?.email}`,
                  err,
                ),
              );
          }
        } catch (error) {
          await queryRunner.rollbackTransaction();
          // Gateway succeeded but DB failed - log for manual reconciliation
          this.logger.error(
            `DB transaction failed after gateway success for ${profile.firstName} ${profile.lastName}. Gateway ref: ${gatewayResult.transactionReference}. Manual reconciliation required.`,
            error,
          );
        } finally {
          await queryRunner.release();
        }
      } catch (error) {
        this.logger.error(
          `Payroll processing failed for ${profile.firstName} ${profile.lastName}`,
          error,
        );
        // Continue with next employee
      }
    }

    return { transactionIds, totalPayout, employeesProcessed };
  }
}
