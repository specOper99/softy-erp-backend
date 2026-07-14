import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommonModule } from '../../common/common.module';
import { TENANT_REPO_ATTENDANCE, TENANT_REPO_STAFF_AVAILABILITY } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { ProcessingType } from '../bookings/domain/entities/processing-type.entity';
import { EmployeeWallet } from '../finance/domain/entities/employee-wallet.entity';
import { Payout } from '../finance/domain/entities/payout.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantsModule } from '../tenants/tenants.module';
import { User } from '../users/domain/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { BookingsModule } from '../bookings/bookings.module';
import {
  AttendanceController,
  HrController,
  ProcessingTypeEligibilityController,
  StaffAvailabilitySlotController,
} from './api';
import {
  Attendance,
  PayrollRun,
  PerformanceReview,
  ProcessingTypeEligibility,
  Profile,
  StaffAvailabilitySlot,
} from './domain/entities';
import { UserDeletedHandler } from './infrastructure/user-deleted.handler';
import { WalletBalanceUpdatedHandler } from './infrastructure/wallet-balance-updated.handler';
import { PayrollRunRepository } from './infrastructure/payroll-run.repository';
import { ProfileRepository } from './infrastructure/profile.repository';
import { AttendanceService } from './application/attendance.service';
import { HrService } from './application/hr.service';
import { MockPaymentGatewayService, PAYMENT_GATEWAY } from './application/payment-gateway.service';
import { PayrollReconciliationService } from './application/payroll-reconciliation.service';
import { PayrollService } from './application/payroll.service';
import { StaffAvailabilitySlotService } from './application/staff-availability-slot.service';
import { ProcessingTypeEligibilityRepository } from './infrastructure/processing-type-eligibility.repository';
import { ProcessingTypeEligibilityService } from './application/processing-type-eligibility.service';
import { ProcessingTypeRepository } from '../bookings/infrastructure/processing-type.repository';

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
    { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGatewayService },
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
