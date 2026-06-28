import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, register } from 'prom-client';

export interface CounterConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface HistogramConfig extends CounterConfig {
  buckets?: number[];
}

export type GaugeConfig = CounterConfig;

/** Idempotent Prometheus metric factory (safe for tests / hot-reload). */
@Injectable()
export class MetricsFactory {
  private getOrCreate<M>(name: string, create: () => M): M {
    const existing = register.getSingleMetric(name);
    return existing ? (existing as M) : create();
  }

  getOrCreateCounter<T extends string = string>(config: CounterConfig): Counter<T> {
    return this.getOrCreate(
      config.name,
      () => new Counter<T>({ name: config.name, help: config.help, labelNames: (config.labelNames ?? []) as T[] }),
    );
  }

  getOrCreateHistogram<T extends string = string>(config: HistogramConfig): Histogram<T> {
    return this.getOrCreate(
      config.name,
      () =>
        new Histogram<T>({
          name: config.name,
          help: config.help,
          labelNames: (config.labelNames ?? []) as T[],
          buckets: config.buckets,
        }),
    );
  }

  getOrCreateGauge<T extends string = string>(config: GaugeConfig): Gauge<T> {
    return this.getOrCreate(
      config.name,
      () => new Gauge<T>({ name: config.name, help: config.help, labelNames: (config.labelNames ?? []) as T[] }),
    );
  }

  clearAllMetrics(): void {
    register.clear();
  }

  removeMetric(name: string): void {
    register.removeSingleMetric(name);
  }
}
