import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeWallet } from '../finance/entities/employee-wallet.entity';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AttendanceController, HrController } from './controllers';
import { Attendance, PayrollRun, PerformanceReview, Profile } from './entities';
import { HrService } from './services/hr.service';
import { MockPaymentGatewayService } from './services/payment-gateway.service';

import { AttendanceService } from './services/attendance.service';

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
  ],
  controllers: [HrController, AttendanceController],
  providers: [HrService, MockPaymentGatewayService, AttendanceService],
  exports: [HrService, AttendanceService],
})
export class HrModule {}
