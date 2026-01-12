import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_REPO_ATTENDANCE } from '../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AttendanceController, HrController } from './controllers';
import { Attendance, PayrollRun, PerformanceReview, Profile } from './entities';
import { UserDeletedHandler } from './handlers/user-deleted.handler';
import { AttendanceService } from './services/attendance.service';
import { HrService } from './services/hr.service';
import { MockPaymentGatewayService } from './services/payment-gateway.service';
import { PayrollService } from './services/payroll.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Profile,
      PayrollRun,
      EmployeeWallet,
      Attendance,
      PerformanceReview,
    ]),
    FinanceModule,
    MailModule,
    TenantsModule,
    UsersModule,
  ],
  controllers: [HrController, AttendanceController],
  providers: [
    HrService,
    PayrollService,
    MockPaymentGatewayService,
    AttendanceService,
    UserDeletedHandler,
    {
      provide: TENANT_REPO_ATTENDANCE,
      useFactory: (repo: Repository<Attendance>) =>
        new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Attendance)],
    },
  ],
  exports: [HrService, PayrollService, AttendanceService],
})
export class HrModule {}
