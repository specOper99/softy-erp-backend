import { Test, TestingModule } from '@nestjs/testing';
import CircuitBreaker from 'opossum';
import { ResilienceModule } from './resilience.module';

describe('ResilienceModule', () => {
  it('should be defined', () => {
    expect(ResilienceModule).toBeDefined();
  });

  describe('forRoot', () => {
    it('should provide circuit breakers with correct names', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ResilienceModule.forRoot([{ name: 'test_breaker', errorThresholdPercentage: 50 }])],
      }).compile();

      const breaker = module.get<CircuitBreaker>('CIRCUIT_BREAKER_TEST_BREAKER');
      expect(breaker).toBeDefined();
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should use default values for threshold and timeout', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ResilienceModule.forRoot([{ name: 'default_breaker' }])],
      }).compile();

      const breaker = module.get<any>('CIRCUIT_BREAKER_DEFAULT_BREAKER');
      // Accessing private options via any
      expect(breaker.options.errorThresholdPercentage).toBe(50);
      expect(breaker.options.resetTimeout).toBe(30000);
    });

    it('should handle circuit breaker firing', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ResilienceModule.forRoot([{ name: 'fire_breaker' }])],
      }).compile();

      const breaker = module.get<CircuitBreaker>('CIRCUIT_BREAKER_FIRE_BREAKER');
      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await breaker.fire(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
    });
  });
});
