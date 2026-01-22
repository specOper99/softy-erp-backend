import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { DatabaseResilienceService } from '../../../common/resilience/database-resilience.service';

@Injectable()
export class CircuitBreakerHealthIndicator extends HealthIndicator {
  constructor(private readonly dbResilience: DatabaseResilienceService) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    const state = this.dbResilience.getState();
    const isHealthy = this.dbResilience.isHealthy();
    const stats = this.dbResilience.getStats();

    const result = this.getStatus(key, isHealthy, {
      state,
      failures: stats.failures,
      successes: stats.successes,
      rejects: stats.rejects,
      fallbacks: stats.fallbacks,
    });

    if (isHealthy) {
      return result;
    }

    throw new HealthCheckError('Database circuit breaker is open', result);
  }
}
