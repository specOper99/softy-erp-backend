import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardService } from './dashboard.service';
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
    forwardRef(() => FinanceModule),
    TasksModule,
    forwardRef(() => BookingsModule),
    HrModule,
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    ReportGeneratorService,
    DashboardGateway,
    DashboardWalletBalanceHandler,
    UserPreferenceRepository,
  ],
  exports: [DashboardGateway, ReportGeneratorService],
})
export class DashboardModule {}
