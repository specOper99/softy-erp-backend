import { Test, TestingModule } from '@nestjs/testing';
import { CacheUtilsService } from '../../common/cache/cache-utils.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportGeneratorService } from './services/report-generator.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: {
            getRevenueSummary: jest.fn().mockResolvedValue([]),
            getStaffPerformance: jest.fn().mockResolvedValue([]),
            getPackageStats: jest.fn().mockResolvedValue([]),
            getKpiSummary: jest.fn().mockResolvedValue({}),
            getBookingTrends: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ReportGeneratorService,
          useValue: {
            generateDashboardPdf: jest.fn().mockResolvedValue(new Uint8Array()),
          },
        },
        {
          provide: CacheUtilsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should call service.getRevenueSummary', async () => {
      await controller.getSummary({});
      expect(service.getRevenueSummary).toHaveBeenCalled();
    });

    it('should propagate errors', async () => {
      service.getRevenueSummary = jest
        .fn()
        .mockRejectedValue(new Error('Summary Error'));
      await expect(controller.getSummary({})).rejects.toThrow('Summary Error');
    });
  });

  describe('getStaffPerformance', () => {
    it('should call service.getStaffPerformance', async () => {
      await controller.getStaffPerformance({});
      expect(service.getStaffPerformance).toHaveBeenCalled();
    });

    it('should propagate errors', async () => {
      service.getStaffPerformance = jest
        .fn()
        .mockRejectedValue(new Error('Perf Error'));
      await expect(controller.getStaffPerformance({})).rejects.toThrow(
        'Perf Error',
      );
    });
  });

  describe('getPackageStats', () => {
    it('should call service.getPackageStats', async () => {
      await controller.getPackageStats({});
      expect(service.getPackageStats).toHaveBeenCalled();
    });

    it('should propagate errors', async () => {
      service.getPackageStats = jest
        .fn()
        .mockRejectedValue(new Error('Pkg Error'));
      await expect(controller.getPackageStats({})).rejects.toThrow('Pkg Error');
    });
  });
});
