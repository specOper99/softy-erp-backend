import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client';
import { MetricsFactory } from '../../../common/services/metrics.factory';

// Initialize default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ prefix: 'softy_' });

@Injectable()
export class MetricsService {
  // Core application metrics
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly activeConnections: Gauge<string>;
  readonly dbQueryDuration: Histogram<string>;
  readonly outboxPendingGauge: Gauge<string>;
  readonly outboxDeadLetterTotal: Counter<string>;

  constructor(private readonly metricsFactory: MetricsFactory) {
    this.httpRequestsTotal = this.metricsFactory.getOrCreateCounter({
      name: 'softy_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
    });

    this.httpRequestDuration = this.metricsFactory.getOrCreateHistogram({
      name: 'softy_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.activeConnections = this.metricsFactory.getOrCreateGauge({
      name: 'softy_active_connections',
      help: 'Number of active connections',
    });

    this.dbQueryDuration = this.metricsFactory.getOrCreateHistogram({
      name: 'softy_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
    });

    this.outboxPendingGauge = this.metricsFactory.getOrCreateGauge({
      name: 'softy_outbox_pending_events',
      help: 'Count of outbox events awaiting dispatch',
    });

    this.outboxDeadLetterTotal = this.metricsFactory.getOrCreateCounter({
      name: 'softy_outbox_dead_letter_total',
      help: 'Outbox events moved to dead letter',
      labelNames: ['eventType'],
    });
  }
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
    const allowAnonymous = process.env.METRICS_ALLOW_ANON === 'true';

    if (!requiredToken) {
      return process.env.NODE_ENV !== 'production' && allowAnonymous;
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
