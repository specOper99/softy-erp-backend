import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BookingsModule } from '../bookings/bookings.module';
import { FinanceModule } from '../finance/finance.module';
import { HrModule } from '../hr/hr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { DashboardController } from './api/dashboard.controller';
import { DashboardGateway } from './api/dashboard.gateway';
import { DashboardService } from './application/dashboard.service';
import { ReportGeneratorService } from './application/report-generator.service';
import { UserPreference } from './domain/entities';
import { DashboardBookingCreatedHandler } from './infrastructure/booking-created.handler';
import { DashboardTransactionCreatedHandler } from './infrastructure/transaction-created.handler';
import { UserPreferenceRepository } from './infrastructure/user-preference.repository';
import { DashboardWalletBalanceHandler } from './infrastructure/wallet-balance-updated.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPreference]),
    AuthModule,
    FinanceModule,
    TasksModule,
    BookingsModule,
    HrModule,
    AnalyticsModule,
    NotificationsModule,
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
