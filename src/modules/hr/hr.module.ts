import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommonModule } from '../../common/common.module';
import { TENANT_REPO_ATTENDANCE } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { TaskType } from '../catalog/entities/task-type.entity';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { Payout } from '../finance/entities/payout.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantsModule } from '../tenants/tenants.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AttendanceController, HrController, TaskTypeEligibilityController } from './controllers';
import { Attendance, PayrollRun, PerformanceReview, Profile, TaskTypeEligibility } from './entities';
import { UserDeletedHandler } from './handlers/user-deleted.handler';
import { WalletBalanceUpdatedHandler } from './handlers/wallet-balance-updated.handler';
import { PayrollRunRepository } from './repositories/payroll-run.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { AttendanceService } from './services/attendance.service';
import { HrService } from './services/hr.service';
import { MockPaymentGatewayService } from './services/payment-gateway.service';
import { PayrollReconciliationService } from './services/payroll-reconciliation.service';
import { PayrollService } from './services/payroll.service';
import { TaskTypeEligibilityService } from './services/task-type-eligibility.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      PayrollRun,
      EmployeeWallet,
      Attendance,
      PerformanceReview,
      Payout,
      TaskTypeEligibility,
      TaskType,
      User,
    ]),
    CommonModule,
    FinanceModule,
    MailModule,
    MetricsModule,
    NotificationsModule,
    TenantsModule,
    UsersModule,
  ],
  controllers: [HrController, AttendanceController, TaskTypeEligibilityController],
  providers: [
    ProfileRepository,
    PayrollRunRepository,
    HrService,
    PayrollService,
    PayrollReconciliationService,
    MockPaymentGatewayService,
    AttendanceService,
    TaskTypeEligibilityService,
    UserDeletedHandler,
    WalletBalanceUpdatedHandler,
    {
      provide: TENANT_REPO_ATTENDANCE,
      useFactory: (repo: Repository<Attendance>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Attendance)],
    },
  ],
  exports: [HrService, PayrollService, AttendanceService, ProfileRepository, PayrollReconciliationService],
})
export class HrModule {}
