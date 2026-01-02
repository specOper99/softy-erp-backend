import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TransactionType } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { Payout } from '../finance/entities/payout.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  CreateProfileDto,
  PayrollRunResponseDto,
  UpdateProfileDto,
} from './dto';
import { Profile } from './entities/profile.entity';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(EmployeeWallet)
    private readonly walletRepository: Repository<EmployeeWallet>,
    private readonly financeService: FinanceService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  // Profile Methods
  async createProfile(dto: CreateProfileDto): Promise<Profile> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }

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
      await this.financeService.getOrCreateWalletWithManager(
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
    const tenantId = TenantContextService.getTenantId();
    return this.profileRepository.find({
      where: { tenantId },
      relations: ['user'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findProfileById(id: string): Promise<Profile> {
    const tenantId = TenantContextService.getTenantId();
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
    const tenantId = TenantContextService.getTenantId();
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
      dto.jobTitle
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
    this.logger.log('Starting scheduled payroll run for all tenants...');

    // Iterate all tenants since cron jobs don't have HTTP request context
    const tenants = await this.tenantsService.findAll();

    for (const tenant of tenants) {
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
    }

    this.logger.log('Scheduled payroll run completed for all tenants');
  }

  /**
   * Batch size for payroll processing.
   * Each batch runs in its own transaction to prevent large memory usage
   * and long-running transactions.
   */
  private readonly PAYROLL_BATCH_SIZE = 100;

  async runPayroll(): Promise<PayrollRunResponseDto> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context required for payroll run');
    }

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

    return {
      totalEmployees: totalEmployeesProcessed,
      totalPayout,
      transactionIds: allTransactionIds,
      processedAt: new Date(),
    };
  }

  /**
   * Process a single batch of payroll in its own transaction.
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // Step 1: Optimized Fetch - Get profiles with wallets in ONE query to avoid N+1
    // We use the profile repository to leverage TypeORM relations or a query builder

    try {
      const profiles = await queryRunner.manager.find(Profile, {
        where: { tenantId },
        relations: ['user', 'user.wallet'],
        skip,
        take,
      });

      const transactionIds: string[] = [];
      let totalPayout = 0;
      let employeesProcessed = 0;

      for (const profile of profiles) {
        // Step 2: Calculate total payout
        const wallet = profile.user?.wallet;

        const baseSalary = Number(profile.baseSalary) || 0;
        const commissionPayable = wallet
          ? Number(wallet.payableBalance) || 0
          : 0;
        const totalAmount = baseSalary + commissionPayable;

        if (totalAmount <= 0) {
          continue; // Skip if no payout
        }

        // Step 3: Create Payout record
        const payout = queryRunner.manager.create(Payout, {
          amount: totalAmount,
          payoutDate: new Date(),
          status: 'COMPLETED',
          tenantId,
          notes: `Monthly payroll for ${profile.firstName || ''} ${profile.lastName || ''}`,
        });
        const savedPayout = await queryRunner.manager.save(payout);

        // Step 4: Create PAYROLL transaction
        const transaction =
          await this.financeService.createTransactionWithManager(
            queryRunner.manager,
            {
              type: TransactionType.PAYROLL,
              amount: totalAmount,
              category: 'Monthly Payroll',
              payoutId: savedPayout.id,
              description: `Payroll for ${profile.firstName || ''} ${profile.lastName || ''}: Salary $${baseSalary} + Commission $${commissionPayable}`,
              transactionDate: new Date(),
            },
          );

        transactionIds.push(transaction.id);
        totalPayout += totalAmount;
        employeesProcessed++;

        // Step 5: Reset payable balance to 0
        if (wallet && commissionPayable > 0) {
          await this.financeService.resetPayableBalance(
            queryRunner.manager,
            profile.userId,
          );
        }

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
      }

      await queryRunner.commitTransaction();

      return { transactionIds, totalPayout, employeesProcessed };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
