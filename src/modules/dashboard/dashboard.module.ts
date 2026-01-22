import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyMetrics } from '../analytics/entities/daily-metrics.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { Task } from '../tasks/entities/task.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardService } from './dashboard.service';
import { ReportGeneratorService } from './services/report-generator.service';

import { AuthModule } from '../auth/auth.module';
import { UserPreference } from './entities/user-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Transaction, Task, Profile, UserPreference, DailyMetrics]), AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, ReportGeneratorService, DashboardGateway],
  exports: [DashboardGateway, ReportGeneratorService],
})
export class DashboardModule {}
