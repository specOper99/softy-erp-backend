import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { OUTBOX_FINANCIAL_CONSUMER } from '../../common/outbox/outbox-consumer.port';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { Booking } from '../bookings/domain/entities/booking.entity';
import { AuthModule } from '../auth/auth.module';
import { BookingRepository } from '../bookings/infrastructure/booking.repository';
import { ReportGeneratorService } from '../dashboard/application/report-generator.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AnalyticsController } from './api/analytics.controller';
import { AnalyticsService } from './application/analytics.service';
import { DailyMetrics } from './domain/entities';
import { DailyMetricsRepository } from './infrastructure/daily-metrics.repository';
import { OutboxFinancialConsumer } from './infrastructure/outbox-financial.consumer';
import { UpdateMetricsHandler } from './infrastructure/update-metrics.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyMetrics, Booking]),
    CqrsModule,
    // Cycle: Common → Outbox → Analytics → Auth/Tenants/Common
    forwardRef(() => AuthModule),
    forwardRef(() => TenantsModule),
    forwardRef(() => CommonModule),
    forwardRef(() => OutboxModule),
  ],
  controllers: [AnalyticsController],
  providers: [
    UpdateMetricsHandler,
    AnalyticsService,
    DailyMetricsRepository,
    BookingRepository,
    ReportGeneratorService,
    OutboxFinancialConsumer,
    {
      provide: OUTBOX_FINANCIAL_CONSUMER,
      useExisting: OutboxFinancialConsumer,
    },
  ],
  exports: [AnalyticsService, DailyMetricsRepository, ReportGeneratorService, OUTBOX_FINANCIAL_CONSUMER],
})
export class AnalyticsModule {}
