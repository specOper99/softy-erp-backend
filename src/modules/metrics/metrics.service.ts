import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
} from 'prom-client';

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

@Injectable()
export class MetricsService {
  /**
   * Retrieve all Prometheus metrics as a string.
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Get the content type for Prometheus metrics.
   */
  getContentType(): string {
    return register.contentType;
  }

  /**
   * Check if the metrics request is authorized.
   * @param authHeader The Authorization header value.
   * @returns true if authorized, false otherwise.
   */
  isMetricsRequestAuthorized(authHeader?: string): boolean {
    const requiredToken = process.env.METRICS_TOKEN;

    // No auth required in non-prod by default for local tooling.
    if (!requiredToken) {
      return process.env.NODE_ENV !== 'production';
    }

    if (typeof authHeader !== 'string') {
      return false;
    }

    const expected = `Bearer ${requiredToken}`;
    return this.timingSafeEquals(authHeader, expected);
  }

  /**
   * Check if metrics endpoint should return 404 in production.
   * This happens when METRICS_TOKEN is not configured.
   */
  shouldHideMetricsInProduction(): boolean {
    return process.env.NODE_ENV === 'production' && !process.env.METRICS_TOKEN;
  }

  private timingSafeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  }
}
