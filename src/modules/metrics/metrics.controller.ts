import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SkipIpRateLimit } from '../../common/decorators/skip-ip-rate-limit.decorator';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { MetricsGuard } from './guards/metrics.guard';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
@SkipThrottle() // Metrics should not be rate limited
@SkipIpRateLimit() // Metrics should not be rate limited (custom IP limiter)
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
  @ApiOperation({ summary: 'Simple health check for metrics' })
  health(): { status: string; timestamp: string } {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
