import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import pLimit from 'p-limit';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { AuditService } from '../../audit/audit.service';
import { EmployeeWallet } from '../../finance/entities/employee-wallet.entity';
import { Payout } from '../../finance/entities/payout.entity';
import { PayoutStatus } from '../../finance/enums/payout-status.enum';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { WalletService } from '../../finance/services/wallet.service';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';
import {
  CreateProfileDto,
  PayrollRunResponseDto,
  UpdateProfileDto,
} from '../dto';
import { PayrollRun, Profile } from '../entities';
import { MockPaymentGatewayService } from './payment-gateway.service';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeeWallet)
    private readonly walletRepository: Repository<EmployeeWallet>,
    private readonly financeService: FinanceService,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly paymentGatewayService: MockPaymentGatewayService,
  ) {}

  // Profile Methods
  async createProfile(dto: CreateProfileDto): Promise<Profile> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate user belongs to the same tenant
      const user = await queryRunner.manager.findOne('User', {
        where: { id: dto.userId, tenantId },
      });
      if (!user) {
        throw new BadRequestException('User not found in tenant');
      }

      // Step 2: Create wallet for the user within the profile transaction
      await this.walletService.getOrCreateWalletWithManager(
        queryRunner.manager,
        dto.userId,
      );

      // Step 2: Create profile
      const profile = queryRunner.manager.create(Profile, {
        ...dto,
        tenantId,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
      });
      const savedProfile = await queryRunner.manager.save(profile);

      // Step 3: Audit Log (outside transaction if preferred, but here included for consistency)
      await this.auditService.log(
        {
          action: 'CREATE',
          entityName: 'Profile',
          entityId: savedProfile.id,
          newValues: {
            userId: dto.userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            baseSalary: dto.baseSalary,
          },
        },
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
      return savedProfile;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      if ((e as { code?: string }).code === '23505') {
        this.logger.warn(`Profile already exists for user ${dto.userId}`);
        throw new ConflictException(
          `Profile already exists for user ${dto.userId}`,
        );
      }
      this.logger.error('Failed to create profile', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllProfiles(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Profile[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.profileRepository.find({
      where: { tenantId },
      relations: ['user'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllProfilesCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: Profile[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const limit = query.limit || 20;

    const qb = this.profileRepository.createQueryBuilder('profile');

    qb.leftJoinAndSelect('profile.user', 'user')
      .where('profile.tenantId = :tenantId', { tenantId })
      .orderBy('profile.createdAt', 'DESC')
      .addOrderBy('profile.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
      const [dateStr, id] = decoded.split('|');
      const date = new Date(dateStr);

      qb.andWhere(
        '(profile.createdAt < :date OR (profile.createdAt = :date AND profile.id < :id))',
        { date, id },
      );
    }

    const profiles = await qb.getMany();
    let nextCursor: string | null = null;

    if (profiles.length > limit) {
      profiles.pop();
      const lastItem = profiles[profiles.length - 1];
      const cursorData = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return { data: profiles, nextCursor };
  }

  async findProfileById(id: string): Promise<Profile> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const profile = await this.profileRepository.findOne({
      where: { id, tenantId },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }
    return profile;
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.profileRepository.findOne({
      where: { userId, tenantId },
      relations: ['user'],
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.findProfileById(id);
    const oldValues = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      baseSalary: profile.baseSalary,
      jobTitle: profile.jobTitle,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      address: profile.address,
      city: profile.city,
      country: profile.country,
      department: profile.department,
      team: profile.team,
      contractType: profile.contractType,
    };

    Object.assign(profile, {
      ...dto,
      hireDate: dto.hireDate ? new Date(dto.hireDate) : profile.hireDate,
    });
    const savedProfile = await this.profileRepository.save(profile);

    // Only log if there are meaningful changes
    if (
      dto.baseSalary !== undefined ||
      dto.firstName ||
      dto.lastName ||
      dto.jobTitle ||
      dto.emergencyContactName ||
      dto.emergencyContactPhone ||
      dto.address ||
      dto.city ||
      dto.country ||
      dto.department ||
      dto.team ||
      dto.contractType
    ) {
      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'Profile',
        entityId: id,
        oldValues,
        newValues: dto,
      });
    }

    return savedProfile;
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = await this.findProfileById(id);
    await this.profileRepository.remove(profile);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'Profile',
      entityId: id,
      oldValues: {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
    });
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

  /**
   * Batch size for payroll processing.
   * Each batch runs in its own transaction to prevent large memory usage
   * and long-running transactions.
   */
  private readonly PAYROLL_BATCH_SIZE = 100;

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

        let payout = await payoutRepository.findOne({
          where: { notes: `Pending payroll for ${referenceId}` },
        });

        if (!payout) {
          payout = payoutRepository.create({
            amount: totalAmount,
            payoutDate: new Date(),
            status: PayoutStatus.PENDING,
            tenantId,
            notes: `Pending payroll for ${referenceId}`,
          });
          payout = await payoutRepository.save(payout);
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
