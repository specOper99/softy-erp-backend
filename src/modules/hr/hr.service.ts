import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReferenceType, TransactionType } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
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
  ) {}

  // Profile Methods
  async createProfile(dto: CreateProfileDto): Promise<Profile> {
    try {
      // Also create wallet for the user
      await this.financeService.getOrCreateWallet(dto.userId);

      const profile = this.profileRepository.create({
        ...dto,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
      });
      const savedProfile = await this.profileRepository.save(profile);

      await this.auditService.log({
        action: 'CREATE',
        entityName: 'Profile',
        entityId: savedProfile.id,
        newValues: {
          userId: dto.userId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          baseSalary: dto.baseSalary,
        },
      });

      return savedProfile;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        this.logger.warn(`Profile already exists for user ${dto.userId}`);
        throw new ConflictException(
          `Profile already exists for user ${dto.userId}`,
        );
      }
      this.logger.error('Failed to create profile', e);
      throw e;
    }
  }

  async findAllProfiles(): Promise<Profile[]> {
    return this.profileRepository.find({ relations: ['user'] });
  }

  async findProfileById(id: string): Promise<Profile> {
    const profile = await this.profileRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }
    return profile;
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    return this.profileRepository.findOne({
      where: { userId },
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
    this.logger.log('Starting scheduled payroll run...');
    try {
      const result = await this.runPayroll();
      this.logger.log(
        `Payroll completed: ${result.totalEmployees} employees, $${result.totalPayout} total payout`,
      );
    } catch (error) {
      this.logger.error('Payroll run failed', error);
    }
  }

  async runPayroll(): Promise<PayrollRunResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Get all profiles with wallets
      const profiles = await queryRunner.manager.find(Profile, {
        relations: ['user'],
      });

      const transactionIds: string[] = [];
      let totalPayout = 0;

      for (const profile of profiles) {
        // Get employee's wallet
        const wallet = await queryRunner.manager.findOne(EmployeeWallet, {
          where: { userId: profile.userId },
        });

        // Step 2: Calculate total payout
        const baseSalary = Number(profile.baseSalary) || 0;
        const commissionPayable = wallet
          ? Number(wallet.payableBalance) || 0
          : 0;
        const totalAmount = baseSalary + commissionPayable;

        if (totalAmount <= 0) {
          continue; // Skip if no payout
        }

        // Step 3: Create PAYROLL transaction
        const transaction =
          await this.financeService.createTransactionWithManager(
            queryRunner.manager,
            {
              type: TransactionType.PAYROLL,
              amount: totalAmount,
              category: 'Monthly Payroll',
              referenceId: profile.userId,
              referenceType: ReferenceType.PAYROLL,
              description: `Payroll for ${profile.firstName || ''} ${profile.lastName || ''}: Salary $${baseSalary} + Commission $${commissionPayable}`,
              transactionDate: new Date(),
            },
          );

        transactionIds.push(transaction.id);
        totalPayout += totalAmount;

        // Step 4: Reset payable balance to 0
        if (wallet && commissionPayable > 0) {
          await this.financeService.resetPayableBalance(
            queryRunner.manager,
            profile.userId,
          );
        }

        // Send payroll notification email (async)
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

      // Audit log for payroll run
      await this.auditService.log(
        {
          action: 'PAYROLL_RUN',
          entityName: 'Payroll',
          entityId: new Date().toISOString().slice(0, 7), // e.g., "2024-12"
          newValues: {
            totalEmployees: profiles.length,
            totalPayout,
            transactionIds,
          },
          notes: `Monthly payroll run completed for ${profiles.length} employees.`,
        },
        queryRunner.manager,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      return {
        totalEmployees: profiles.length,
        totalPayout,
        transactionIds,
        processedAt: new Date(),
      };
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
