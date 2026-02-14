import { Test, TestingModule } from '@nestjs/testing';
import { createMockMetricsFactory } from '../../../test/helpers/mock-factories';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  const mockMetricsFactory = createMockMetricsFactory();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: MetricsFactory,
          useValue: mockMetricsFactory,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    // Reset environment variables
    delete process.env.METRICS_TOKEN;
    delete process.env.METRICS_ALLOW_ANON;
    delete process.env.NODE_ENV;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return metrics as string', async () => {
      const result = await service.getMetrics();

      expect(typeof result).toBe('string');
      expect(result).toContain('softy_'); // Custom prefix
    });
  });

  describe('getContentType', () => {
    it('should return prometheus content type', () => {
      const result = service.getContentType();

      expect(result).toContain('text/plain');
    });
  });

  describe('isMetricsRequestAuthorized', () => {
    it('should return true when no token required in non-prod', () => {
      process.env.NODE_ENV = 'development';
      process.env.METRICS_ALLOW_ANON = 'true';
      delete process.env.METRICS_TOKEN;

      const result = service.isMetricsRequestAuthorized();

      expect(result).toBe(true);
    });

    it('should return false when no token required in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.METRICS_ALLOW_ANON = 'true';
      delete process.env.METRICS_TOKEN;

      const result = service.isMetricsRequestAuthorized();

      expect(result).toBe(false);
    });

    it('should return false when no token and anonymous metrics disabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.METRICS_ALLOW_ANON = 'false';
      delete process.env.METRICS_TOKEN;

      const result = service.isMetricsRequestAuthorized();

      expect(result).toBe(false);
    });

    it('should return true when valid token provided', () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const result = service.isMetricsRequestAuthorized('Bearer test-metrics-token');

      expect(result).toBe(true);
    });

    it('should return false when invalid token provided', () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const result = service.isMetricsRequestAuthorized('Bearer wrong-token');

      expect(result).toBe(false);
    });

    it('should return false when no auth header and token required', () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const result = service.isMetricsRequestAuthorized();

      expect(result).toBe(false);
    });

    it('should return false when auth header is not a string', () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const result = service.isMetricsRequestAuthorized(undefined);

      expect(result).toBe(false);
    });
  });

  describe('shouldHideMetricsInProduction', () => {
    it('should return true in production without token', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.METRICS_TOKEN;

      const result = service.shouldHideMetricsInProduction();

      expect(result).toBe(true);
    });

    it('should return false in production with token', () => {
      process.env.NODE_ENV = 'production';
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const result = service.shouldHideMetricsInProduction();

      expect(result).toBe(false);
    });

    it('should return false in non-production', () => {
      process.env.NODE_ENV = 'development';

      const result = service.shouldHideMetricsInProduction();

      expect(result).toBe(false);
    });
  });
});
