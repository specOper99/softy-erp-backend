import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import CircuitBreaker from 'opossum';

@Injectable()
export class DatabaseResilienceService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseResilienceService.name);

  constructor(
    @Inject('CIRCUIT_BREAKER_DATABASE')
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  onModuleInit() {
    this.circuitBreaker.on('open', () => {
      this.logger.error('Database circuit breaker OPENED - too many failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.warn('Database circuit breaker HALF-OPEN - testing recovery');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log('Database circuit breaker CLOSED - service recovered');
    });

    this.circuitBreaker.on('fallback', () => {
      this.logger.warn('Database circuit breaker FALLBACK triggered');
    });
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.fire(operation) as Promise<T>;
  }

  getState(): string {
    if (this.circuitBreaker.opened) return 'OPEN';
    if (this.circuitBreaker.halfOpen) return 'HALF_OPEN';
    return 'CLOSED';
  }

  getStats(): CircuitBreaker.Stats {
    return this.circuitBreaker.stats;
  }

  isHealthy(): boolean {
    return !this.circuitBreaker.opened;
  }
}
