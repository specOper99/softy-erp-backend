import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { DailyMetrics } from './entities/daily-metrics.entity';
import { UpdateMetricsHandler } from './handlers/update-metrics.handler';
import { AnalyticsService } from './services/analytics.service';
import { ReportGeneratorService } from '../dashboard/services/report-generator.service';

import { AuthModule } from '../auth/auth.module';
import { BookingRepository } from '../bookings/repositories/booking.repository';
import { TenantsModule } from '../tenants/tenants.module';
import { AnalyticsController } from './controllers';
import { DailyMetricsRepository } from './repositories/daily-metrics.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DailyMetrics, Booking]), CqrsModule, AuthModule, TenantsModule],
  controllers: [AnalyticsController],
  providers: [
    UpdateMetricsHandler,
    AnalyticsService,
    DailyMetricsRepository,
    BookingRepository,
    ReportGeneratorService,
  ],
  exports: [AnalyticsService, DailyMetricsRepository, ReportGeneratorService],
})
export class AnalyticsModule {}
