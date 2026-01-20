import { HealthCheckError } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseResilienceService } from '../../../common/resilience/database-resilience.service';
import { CircuitBreakerHealthIndicator } from './circuit-breaker.health';

describe('CircuitBreakerHealthIndicator', () => {
  let indicator: CircuitBreakerHealthIndicator;
  let _dbResilience: DatabaseResilienceService;

  const mockDbResilience = {
    getState: jest.fn(),
    isHealthy: jest.fn(),
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerHealthIndicator,
        {
          provide: DatabaseResilienceService,
          useValue: mockDbResilience,
        },
      ],
    }).compile();

    indicator = module.get<CircuitBreakerHealthIndicator>(CircuitBreakerHealthIndicator);
    _dbResilience = module.get<DatabaseResilienceService>(DatabaseResilienceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should report healthy', () => {
    mockDbResilience.isHealthy.mockReturnValue(true);
    mockDbResilience.getState.mockReturnValue('CLOSED');
    mockDbResilience.getStats.mockReturnValue({
      failures: 0,
      successes: 10,
      rejects: 0,
      fallbacks: 0,
    });

    const result = indicator.isHealthy('db_circuit');
    expect(result).toEqual({
      db_circuit: {
        status: 'up',
        state: 'CLOSED',
        failures: 0,
        successes: 10,
        rejects: 0,
        fallbacks: 0,
      },
    });
  });

  it('should report unhealthy (throw error)', () => {
    mockDbResilience.isHealthy.mockReturnValue(false);
    mockDbResilience.getState.mockReturnValue('OPEN');
    mockDbResilience.getStats.mockReturnValue({
      failures: 5,
      successes: 0,
      rejects: 5,
      fallbacks: 0,
    });

    expect(() => indicator.isHealthy('db_circuit')).toThrow(HealthCheckError);
  });
});
