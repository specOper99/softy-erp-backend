import { Module } from '@nestjs/common';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { MetricsController } from './api/metrics.controller';
import { MetricsService } from './application/metrics.service';
import { MetricsGuard } from './infrastructure/guards/metrics.guard';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsFactory, MetricsGuard],
  exports: [MetricsService, MetricsFactory],
})
export class MetricsModule {}
