import { Test, TestingModule } from '@nestjs/testing';
import { ReportGeneratorService } from './report-generator.service';

describe('ReportGeneratorService', () => {
  let service: ReportGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportGeneratorService],
    }).compile();

    service = module.get<ReportGeneratorService>(ReportGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateDashboardPdf', () => {
    it('should generate a PDF buffer', async () => {
      const mockData = {
        kpis: {
          totalRevenue: 1000,
          totalBookings: 10,
          taskCompletionRate: 85,
          averageBookingValue: 100,
          activeProjects: 5,
          pendingTasks: 3,
          activeStaffCount: 2,
        },
        revenue: { revenueByMonth: [] },
        bookingTrends: [],
        staffPerformance: [],
        packageStats: [],
      };

      const result = await service.generateDashboardPdf(mockData);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      const mockData = {
        kpis: {
          totalRevenue: 0,
          totalBookings: 0,
          taskCompletionRate: 0,
          averageBookingValue: 0,
          activeProjects: 0,
          pendingTasks: 0,
          activeStaffCount: 0,
        },
        revenue: { revenueByMonth: [] },
        bookingTrends: [],
        staffPerformance: [],
        packageStats: [],
      };

      const result = await service.generateDashboardPdf(mockData);
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
