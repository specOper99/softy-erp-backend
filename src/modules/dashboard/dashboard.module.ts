import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardService } from './dashboard.service';
import { DashboardBookingCreatedHandler } from './handlers/booking-created.handler';
import { DashboardTransactionCreatedHandler } from './handlers/transaction-created.handler';
import { DashboardWalletBalanceHandler } from './handlers/wallet-balance-updated.handler';
import { UserPreferenceRepository } from './repositories/user-preference.repository';
import { ReportGeneratorService } from './services/report-generator.service';

import { AuthModule } from '../auth/auth.module';
import { UserPreference } from './entities/user-preference.entity';

import { AnalyticsModule } from '../analytics/analytics.module';
import { BookingsModule } from '../bookings/bookings.module';
import { FinanceModule } from '../finance/finance.module';
import { HrModule } from '../hr/hr.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPreference]),
    AuthModule,
    FinanceModule,
    TasksModule,
    BookingsModule,
    HrModule,
    AnalyticsModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    ReportGeneratorService,
    DashboardGateway,
    DashboardBookingCreatedHandler,
    DashboardTransactionCreatedHandler,
    DashboardWalletBalanceHandler,
    UserPreferenceRepository,
  ],
  exports: [DashboardGateway, ReportGeneratorService],
})
export class DashboardModule {}
