import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { register } from 'prom-client';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return metrics from register', async () => {
      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      const metricsSpy = jest
        .spyOn(register, 'metrics')
        .mockResolvedValue('test_metrics');

      await controller.getMetrics(mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        'Content-Type',
        expect.any(String),
      );
      expect(mockRes.send).toHaveBeenCalledWith('test_metrics');

      metricsSpy.mockRestore();
    });
  });

  describe('health', () => {
    it('should return healthy status', async () => {
      const result = await controller.health();
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
    });
  });
});
