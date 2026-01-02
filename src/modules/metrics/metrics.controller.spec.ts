import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
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
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

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

    it('should return 401 when METRICS_TOKEN is set and auth is missing', async () => {
      process.env = { ...originalEnv, NODE_ENV: 'test', METRICS_TOKEN: 'abc' };

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

    it('should return 401 when METRICS_TOKEN is set and auth is wrong', async () => {
      process.env = { ...originalEnv, NODE_ENV: 'test', METRICS_TOKEN: 'abc' };

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const mockReq = {
        headers: { authorization: 'Bearer wrong' },
      } as unknown as Request;

      await controller.getMetrics(mockRes, mockReq);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
    });

    it('should return metrics when METRICS_TOKEN is set and auth is correct', async () => {
      process.env = { ...originalEnv, NODE_ENV: 'test', METRICS_TOKEN: 'abc' };

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const mockReq = {
        headers: { authorization: 'Bearer abc' },
      } as unknown as Request;

      const metricsSpy = jest
        .spyOn(register, 'metrics')
        .mockResolvedValue('test_metrics');

      await controller.getMetrics(mockRes, mockReq);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalledWith('test_metrics');

      metricsSpy.mockRestore();
    });

    it('should handle errors from register.metrics', async () => {
      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      const metricsSpy = jest
        .spyOn(register, 'metrics')
        .mockRejectedValue(new Error('Metrics Error'));

      await expect(controller.getMetrics(mockRes)).rejects.toThrow(
        'Metrics Error',
      );

      expect(mockRes.set).toHaveBeenCalledWith(
        'Content-Type',
        expect.any(String),
      );

      metricsSpy.mockRestore();
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
