import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let _metricsService: MetricsService;

  const mockMetricsService = {
    getMetrics: jest.fn().mockResolvedValue('test_metrics'),
    getContentType: jest.fn().mockReturnValue('text/plain'),
    isMetricsRequestAuthorized: jest.fn().mockReturnValue(true),
    shouldHideMetricsInProduction: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: mockMetricsService }],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    _metricsService = module.get<MetricsService>(MetricsService);
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

    it('should return 401 when not authorized', async () => {
      mockMetricsService.isMetricsRequestAuthorized.mockReturnValue(false);
      mockMetricsService.shouldHideMetricsInProduction.mockReturnValue(false);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const mockReq = {
        headers: {},
      } as unknown as Request;

      await controller.getMetrics(mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
    });

    it('should return 404 when in production without METRICS_TOKEN', async () => {
      mockMetricsService.isMetricsRequestAuthorized.mockReturnValue(false);
      mockMetricsService.shouldHideMetricsInProduction.mockReturnValue(true);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const mockReq = {
        headers: {},
      } as unknown as Request;

      await controller.getMetrics(mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.send).toHaveBeenCalledWith('Not Found');
    });

    it('should return metrics when authorized', async () => {
      mockMetricsService.isMetricsRequestAuthorized.mockReturnValue(true);

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const mockReq = {
        headers: { authorization: 'Bearer abc' },
      } as unknown as Request;

      await controller.getMetrics(mockRes, mockReq);

      expect(mockRes.status).not.toHaveBeenCalled();
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
