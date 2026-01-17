import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { PnLEntry, RevenueByPackageEntry } from '../../finance/types/report.types';
import { FinancialReportFilterDto } from '../dto/financial-report.dto';
import { FinancialReportService } from '../services/financial-report.service';
import { FinancialReportController } from './financial-report.controller';

describe('FinancialReportController', () => {
  let controller: FinancialReportController;
  let financialReportService: jest.Mocked<FinancialReportService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let reportGeneratorService: jest.Mocked<ReportGeneratorService>;

  const mockPnlData: PnLEntry[] = [
    {
      period: '2024-01',
      income: 50000,
      expenses: 20000,
      payroll: 0,
      net: 30000,
    },
  ];

  const mockRevenueByPackage: RevenueByPackageEntry[] = [
    { packageName: 'Premium', bookingCount: 10, totalRevenue: 30000 },
    { packageName: 'Basic', bookingCount: 20, totalRevenue: 20000 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialReportController],
      providers: [
        {
          provide: FinancialReportService,
          useValue: {
            getProfitAndLoss: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            getRevenueByPackage: jest.fn(),
          },
        },
        {
          provide: ReportGeneratorService,
          useValue: {
            generatePnLPdf: jest.fn(),
            generateRevenueByPackagePdf: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<FinancialReportController>(FinancialReportController);
    financialReportService = module.get(FinancialReportService);
    analyticsService = module.get(AnalyticsService);
    reportGeneratorService = module.get(ReportGeneratorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfitAndLoss', () => {
    it('should return P&L data', async () => {
      financialReportService.getProfitAndLoss.mockResolvedValue(mockPnlData);

      const filter = new FinancialReportFilterDto();
      filter.startDate = '2024-01-01';
      filter.endDate = '2024-12-31';
      const result = await controller.getProfitAndLoss(filter);

      expect(financialReportService.getProfitAndLoss).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockPnlData);
    });
  });

  describe('getProfitAndLossPdf', () => {
    it('should return PDF with correct headers', async () => {
      const mockPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      financialReportService.getProfitAndLoss.mockResolvedValue(mockPnlData);
      reportGeneratorService.generatePnLPdf.mockResolvedValue(mockPdfBytes);

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.getProfitAndLossPdf(new FinancialReportFilterDto(), mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=profit_and_loss.pdf',
        'Content-Length': mockPdfBytes.length,
      });
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('getRevenueByPackage', () => {
    it('should return revenue by package data', async () => {
      analyticsService.getRevenueByPackage.mockResolvedValue(
        mockRevenueByPackage as unknown as RevenueByPackageEntry[],
      );

      const filter = new FinancialReportFilterDto();
      filter.startDate = '2024-01-01';
      const result = await controller.getRevenueByPackage(filter);

      expect(analyticsService.getRevenueByPackage).toHaveBeenCalledWith(filter);
      expect(result).toEqual(mockRevenueByPackage);
    });
  });

  describe('getRevenueByPackagePdf', () => {
    it('should return PDF with correct headers', async () => {
      const mockPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      analyticsService.getRevenueByPackage.mockResolvedValue(
        mockRevenueByPackage as unknown as RevenueByPackageEntry[],
      );
      reportGeneratorService.generateRevenueByPackagePdf.mockResolvedValue(mockPdfBytes);

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.getRevenueByPackagePdf(new FinancialReportFilterDto(), mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=revenue_by_package.pdf',
        'Content-Length': mockPdfBytes.length,
      });
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
