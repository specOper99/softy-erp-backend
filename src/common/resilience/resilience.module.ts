import { DynamicModule, Global, Module } from '@nestjs/common';
import CircuitBreaker from 'opossum';

export interface CircuitBreakerOptions extends CircuitBreaker.Options {
  name: string;
}

@Global()
@Module({})
export class ResilienceModule {
  static forRoot(options: CircuitBreakerOptions[]): DynamicModule {
    const providers = options.map((opt) => ({
      provide: `CIRCUIT_BREAKER_${opt.name.toUpperCase()}`,
      useFactory: () => {
        // This is a dummy function that we'll wrap with the breaker
        const breaker = new CircuitBreaker(
          async (fn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => await fn(...args),
          {
            ...opt,
            errorThresholdPercentage: opt.errorThresholdPercentage || 50,
            resetTimeout: opt.resetTimeout || 30000,
          },
        );
        return breaker;
      },
    }));

    return {
      module: ResilienceModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  }
}
