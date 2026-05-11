import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommonModule } from '../../common/common.module';
import { TENANT_REPO_ATTENDANCE, TENANT_REPO_STAFF_AVAILABILITY } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { ProcessingType } from '../bookings/entities/processing-type.entity';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { Payout } from '../finance/entities/payout.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantsModule } from '../tenants/tenants.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { BookingsModule } from '../bookings/bookings.module';
import {
  AttendanceController,
  HrController,
  ProcessingTypeEligibilityController,
  StaffAvailabilitySlotController,
} from './controllers';
import {
  Attendance,
  PayrollRun,
  PerformanceReview,
  ProcessingTypeEligibility,
  Profile,
  StaffAvailabilitySlot,
} from './entities';
import { UserDeletedHandler } from './handlers/user-deleted.handler';
import { WalletBalanceUpdatedHandler } from './handlers/wallet-balance-updated.handler';
import { PayrollRunRepository } from './repositories/payroll-run.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { AttendanceService } from './services/attendance.service';
import { HrService } from './services/hr.service';
import { MockPaymentGatewayService } from './services/payment-gateway.service';
import { PayrollReconciliationService } from './services/payroll-reconciliation.service';
import { PayrollService } from './services/payroll.service';
import { StaffAvailabilitySlotService } from './services/staff-availability-slot.service';
import { ProcessingTypeEligibilityRepository } from './repositories/processing-type-eligibility.repository';
import { ProcessingTypeEligibilityService } from './services/processing-type-eligibility.service';
import { ProcessingTypeRepository } from '../bookings/repositories/processing-type.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      PayrollRun,
      EmployeeWallet,
      Attendance,
      PerformanceReview,
      Payout,
      StaffAvailabilitySlot,
      ProcessingTypeEligibility,
      ProcessingType,
      User,
    ]),
    CommonModule,
    FinanceModule,
    MailModule,
    MetricsModule,
    NotificationsModule,
    TenantsModule,
    UsersModule,
    BookingsModule,
  ],
  controllers: [
    HrController,
    AttendanceController,
    StaffAvailabilitySlotController,
    ProcessingTypeEligibilityController,
  ],
  providers: [
    ProfileRepository,
    PayrollRunRepository,
    HrService,
    PayrollService,
    PayrollReconciliationService,
    MockPaymentGatewayService,
    AttendanceService,
    StaffAvailabilitySlotService,
    ProcessingTypeEligibilityService,
    ProcessingTypeEligibilityRepository,
    ProcessingTypeRepository,
    UserDeletedHandler,
    WalletBalanceUpdatedHandler,
    {
      provide: TENANT_REPO_ATTENDANCE,
      useFactory: (repo: Repository<Attendance>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Attendance)],
    },
    {
      provide: TENANT_REPO_STAFF_AVAILABILITY,
      useFactory: (repo: Repository<StaffAvailabilitySlot>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(StaffAvailabilitySlot)],
    },
  ],
  exports: [HrService, PayrollService, AttendanceService, ProfileRepository, PayrollReconciliationService],
})
export class HrModule {}
