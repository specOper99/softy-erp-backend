import { Module } from '@nestjs/common';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { MetricsGuard } from './guards/metrics.guard';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsFactory, MetricsGuard],
  exports: [MetricsService, MetricsFactory],
})
export class MetricsModule {}
