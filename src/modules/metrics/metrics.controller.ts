import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { MetricsGuard } from './guards/metrics.guard';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
@SkipTenant() // Metrics are global, not tenant-specific
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @UseGuards(MetricsGuard)
  @ApiOperation({ summary: 'Prometheus metrics endpoint (requires METRICS_TOKEN in production)' })
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metricsService.getContentType());
    res.send(await this.metricsService.getMetrics());
  }

  @Get('health')
  @UseGuards(MetricsGuard)
  @ApiOperation({ summary: 'Simple health check for metrics' })
  health(): { status: string; timestamp: string } {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
