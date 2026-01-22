import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseResilienceService } from './database-resilience.service';

describe('DatabaseResilienceService', () => {
  let service: DatabaseResilienceService;
  let mockCircuitBreaker: {
    on: jest.Mock;
    fire: jest.Mock;
    opened: boolean;
    halfOpen: boolean;
    stats: object;
  };

  beforeEach(async () => {
    mockCircuitBreaker = {
      on: jest.fn(),
      fire: jest.fn(),
      opened: false,
      halfOpen: false,
      stats: { failures: 0, successes: 10, rejects: 0 },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseResilienceService,
        {
          provide: 'CIRCUIT_BREAKER_DATABASE',
          useValue: mockCircuitBreaker,
        },
      ],
    }).compile();

    service = module.get<DatabaseResilienceService>(DatabaseResilienceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should register event listeners', () => {
      service.onModuleInit();

      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('fallback', expect.any(Function));
    });

    it('should log on open event', () => {
      service.onModuleInit();

      const openCallback = mockCircuitBreaker.on.mock.calls.find((call) => call[0] === 'open')?.[1];
      expect(openCallback).toBeDefined();
      // Call should not throw
      expect(() => openCallback()).not.toThrow();
    });

    it('should log on halfOpen event', () => {
      service.onModuleInit();

      const halfOpenCallback = mockCircuitBreaker.on.mock.calls.find((call) => call[0] === 'halfOpen')?.[1];
      expect(halfOpenCallback).toBeDefined();
      expect(() => halfOpenCallback()).not.toThrow();
    });

    it('should log on close event', () => {
      service.onModuleInit();

      const closeCallback = mockCircuitBreaker.on.mock.calls.find((call) => call[0] === 'close')?.[1];
      expect(closeCallback).toBeDefined();
      expect(() => closeCallback()).not.toThrow();
    });

    it('should log on fallback event', () => {
      service.onModuleInit();

      const fallbackCallback = mockCircuitBreaker.on.mock.calls.find((call) => call[0] === 'fallback')?.[1];
      expect(fallbackCallback).toBeDefined();
      expect(() => fallbackCallback()).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute operation through circuit breaker', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      mockCircuitBreaker.fire.mockResolvedValue('result');

      const result = await service.execute(operation);

      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(operation);
      expect(result).toBe('result');
    });

    it('should propagate errors from circuit breaker', async () => {
      const error = new Error('Circuit open');
      mockCircuitBreaker.fire.mockRejectedValue(error);

      await expect(service.execute(jest.fn())).rejects.toThrow('Circuit open');
    });
  });

  describe('getState', () => {
    it('should return OPEN when opened', () => {
      mockCircuitBreaker.opened = true;
      mockCircuitBreaker.halfOpen = false;

      expect(service.getState()).toBe('OPEN');
    });

    it('should return HALF_OPEN when half open', () => {
      mockCircuitBreaker.opened = false;
      mockCircuitBreaker.halfOpen = true;

      expect(service.getState()).toBe('HALF_OPEN');
    });

    it('should return CLOSED when closed', () => {
      mockCircuitBreaker.opened = false;
      mockCircuitBreaker.halfOpen = false;

      expect(service.getState()).toBe('CLOSED');
    });
  });

  describe('getStats', () => {
    it('should return circuit breaker stats', () => {
      const stats = service.getStats();

      expect(stats).toEqual(mockCircuitBreaker.stats);
    });
  });

  describe('isHealthy', () => {
    it('should return true when circuit is closed', () => {
      mockCircuitBreaker.opened = false;

      expect(service.isHealthy()).toBe(true);
    });

    it('should return false when circuit is open', () => {
      mockCircuitBreaker.opened = true;

      expect(service.isHealthy()).toBe(false);
    });
  });
});
