import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, register } from 'prom-client';

export interface CounterConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface HistogramConfig {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
}

export interface GaugeConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

/**
 * Injectable factory for creating Prometheus metrics.
 * Handles idempotent registration to avoid duplicate metric errors in tests and hot-reload scenarios.
 *
 * @example
 * ```typescript
 * constructor(private readonly metricsFactory: MetricsFactory) {
 *   this.requestCounter = metricsFactory.getOrCreateCounter({
 *     name: 'http_requests_total',
 *     help: 'Total HTTP requests',
 *     labelNames: ['method', 'path'],
 *   });
 * }
 * ```
 */
@Injectable()
export class MetricsFactory {
  /**
   * Get an existing counter or create a new one if it doesn't exist.
   */
  getOrCreateCounter<T extends string = string>(config: CounterConfig): Counter<T> {
    const existing = register.getSingleMetric(config.name);
    if (existing) {
      return existing as Counter<T>;
    }
    return new Counter<T>({
      name: config.name,
      help: config.help,
      labelNames: (config.labelNames ?? []) as T[],
    });
  }

  /**
   * Get an existing histogram or create a new one if it doesn't exist.
   */
  getOrCreateHistogram<T extends string = string>(config: HistogramConfig): Histogram<T> {
    const existing = register.getSingleMetric(config.name);
    if (existing) {
      return existing as Histogram<T>;
    }
    return new Histogram<T>({
      name: config.name,
      help: config.help,
      labelNames: (config.labelNames ?? []) as T[],
      buckets: config.buckets,
    });
  }

  /**
   * Get an existing gauge or create a new one if it doesn't exist.
   */
  getOrCreateGauge<T extends string = string>(config: GaugeConfig): Gauge<T> {
    const existing = register.getSingleMetric(config.name);
    if (existing) {
      return existing as Gauge<T>;
    }
    return new Gauge<T>({
      name: config.name,
      help: config.help,
      labelNames: (config.labelNames ?? []) as T[],
    });
  }

  /**
   * Clear all metrics from the registry.
   * Useful for test cleanup.
   */
  clearAllMetrics(): void {
    register.clear();
  }

  /**
   * Remove a specific metric from the registry.
   */
  removeMetric(name: string): void {
    register.removeSingleMetric(name);
  }
}
