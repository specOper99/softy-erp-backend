import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SkipIpRateLimit } from '../../common/decorators/skip-ip-rate-limit.decorator';
import { SkipTenant } from '../../modules/tenants/decorators/skip-tenant.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
@SkipThrottle() // Metrics should not be rate limited
@SkipIpRateLimit() // Metrics should not be rate limited (custom IP limiter)
@SkipTenant() // Metrics are global, not tenant-specific
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async getMetrics(@Res() res: Response, @Req() req?: Request): Promise<void> {
    const authHeader = req?.headers?.authorization;

    if (!this.metricsService.isMetricsRequestAuthorized(authHeader)) {
      // In production, if METRICS_TOKEN is not configured we return 404 to avoid public discovery.
      if (this.metricsService.shouldHideMetricsInProduction()) {
        res.status(404).send('Not Found');
        return;
      }

      res.status(401).send('Unauthorized');
      return;
    }

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
