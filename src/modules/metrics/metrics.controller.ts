import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
} from 'prom-client';
import { SkipTenant } from '../../common/decorators';

// Initialize default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ prefix: 'chapters_' });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'chapters_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

export const httpRequestDuration = new Histogram({
  name: 'chapters_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const activeConnections = new Gauge({
  name: 'chapters_active_connections',
  help: 'Number of active connections',
});

export const dbQueryDuration = new Histogram({
  name: 'chapters_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
});

@ApiTags('Metrics')
@Controller('metrics')
@SkipThrottle() // Metrics should not be rate limited
@SkipTenant() // Metrics are global, not tenant-specific
export class MetricsController {
  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async getMetrics(@Res() res: Response, @Req() req?: Request): Promise<void> {
    if (!this.isMetricsRequestAuthorized(req)) {
      // In production, if METRICS_TOKEN is not configured we return 404 to avoid public discovery.
      if (process.env.NODE_ENV === 'production' && !process.env.METRICS_TOKEN) {
        res.status(404).send('Not Found');
        return;
      }

      res.status(401).send('Unauthorized');
      return;
    }

    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }

  private isMetricsRequestAuthorized(req?: Request): boolean {
    const requiredToken = process.env.METRICS_TOKEN;

    // No auth required in non-prod by default for local tooling.
    if (!requiredToken) {
      return process.env.NODE_ENV !== 'production';
    }

    const authHeader = req?.headers?.authorization;
    if (typeof authHeader !== 'string') {
      return false;
    }

    const expected = `Bearer ${requiredToken}`;
    return this.timingSafeEquals(authHeader, expected);
  }

  private timingSafeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
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
