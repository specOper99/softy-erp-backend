import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { TenantsService } from '../../tenants/tenants.service';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let reportGeneratorService: jest.Mocked<ReportGeneratorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getRevenueByPackage: jest.fn(),
            getTaxReport: jest.fn(),
          },
        },
        {
          provide: ReportGeneratorService,
          useValue: {
            generateRevenueByPackagePdf: jest.fn(),
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
    reportGeneratorService = module.get(ReportGeneratorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRevenueByPackage', () => {
    it('should return revenue by package data', async () => {
      const filter = { startDate: '2024-01-01', endDate: '2024-12-31' };
      const mockData = [
        { packageName: 'Basic', bookingCount: 10, totalRevenue: 5000 },
        { packageName: 'Premium', bookingCount: 5, totalRevenue: 10000 },
      ];
      analyticsService.getRevenueByPackage.mockResolvedValue(mockData);

      const result = await controller.getRevenueByPackage(filter);

      expect(analyticsService.getRevenueByPackage).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockData);
    });
  });

  describe('getRevenueByPackagePdf', () => {
    it('should generate and return PDF', async () => {
      const filter = { startDate: '2024-01-01', endDate: '2024-12-31' };
      const mockData = [{ packageName: 'Basic', bookingCount: 10, totalRevenue: 5000 }];
      const mockPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

      analyticsService.getRevenueByPackage.mockResolvedValue(mockData);
      reportGeneratorService.generateRevenueByPackagePdf.mockResolvedValue(mockPdfBytes);

      const mockResponse = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getRevenueByPackagePdf(filter, mockResponse as unknown as Response);

      expect(analyticsService.getRevenueByPackage).toHaveBeenCalledWith(filter);
      expect(reportGeneratorService.generateRevenueByPackagePdf).toHaveBeenCalledWith(mockData);
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=revenue_by_package.pdf',
        'Content-Length': mockPdfBytes.length,
      });
      expect(mockResponse.end).toHaveBeenCalled();
    });
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
