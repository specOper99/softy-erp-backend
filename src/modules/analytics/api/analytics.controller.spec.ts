import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TenantsService } from '../../tenants/application/tenants.service';
import { AnalyticsService } from '../application/analytics.service';
import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getTaxReport: jest.fn(),
          },
        },
        {
          provide: TenantsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ subscriptionPlan: 'PRO' }),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTaxReport', () => {
    it('should return tax report data', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const mockReport = {
        totalTax: 1500,
        totalSubTotal: 15000,
        totalGross: 16500,
        startDate,
        endDate,
      };

      analyticsService.getTaxReport.mockResolvedValue(mockReport);

      const result = await controller.getTaxReport(startDate, endDate);

      expect(analyticsService.getTaxReport).toHaveBeenCalledWith(startDate, endDate);
      expect(result).toEqual(mockReport);
    });
  });
});
