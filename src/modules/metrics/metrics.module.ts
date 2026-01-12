import { Module } from '@nestjs/common';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsFactory],
  exports: [MetricsService, MetricsFactory],
})
export class MetricsModule {}
