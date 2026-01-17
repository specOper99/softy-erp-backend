import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Note: Auth logic is now handled by MetricsGuard.
 * See guards/metrics.guard.spec.ts for auth-specific tests.
 */
describe('MetricsController', () => {
  let controller: MetricsController;

  const mockMetricsService = {
    getMetrics: jest.fn().mockResolvedValue('test_metrics'),
    getContentType: jest.fn().mockReturnValue('text/plain'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'METRICS_TOKEN') return 'test-token';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return metrics from service', async () => {
      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.getMetrics(mockRes);

      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(mockRes.send).toHaveBeenCalledWith('test_metrics');
    });

    it('should handle errors from service.getMetrics', async () => {
      mockMetricsService.getMetrics.mockRejectedValue(new Error('Metrics Error'));

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await expect(controller.getMetrics(mockRes)).rejects.toThrow('Metrics Error');

      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
    });
  });

  describe('health', () => {
    it('should return healthy status', () => {
      const result = controller.health();
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
    });
  });
});
