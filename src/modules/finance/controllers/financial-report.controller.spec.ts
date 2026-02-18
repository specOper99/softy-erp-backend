import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { PnLEntry, RevenueByPackageEntry } from '../../finance/types/report.types';
import { Role } from '../../users/enums/role.enum';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { FinancialReportFilterDto } from '../dto/financial-report.dto';
import { PackageProfitabilityDto, ProfitabilityQueryDto } from '../dto/profitability.dto';
import {
  ClientStatementQueryDto,
  EmployeeStatementQueryDto,
  StatementResponseDto,
  VendorStatementQueryDto,
} from '../dto/statement.dto';
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

  const mockStatementResponse: StatementResponseDto = {
    entityId: 'entity-1',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    currency: 'USD',
    totals: {
      income: 500,
      expense: 200,
      payroll: 100,
      net: 200,
    },
    lines: [
      {
        id: 'tx-1',
        type: 'INCOME',
        amount: 500,
        category: 'Booking Payment',
        description: 'Payment',
        transactionDate: new Date('2024-01-05T00:00:00.000Z'),
        referenceId: 'ref-1',
      },
    ],
  };

  const mockProfitabilityResponse: PackageProfitabilityDto[] = [
    {
      packageId: 'pkg-1',
      revenue: 1500,
      commissions: 300,
      expenses: 200,
      netProfit: 1000,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialReportController],
      providers: [
        {
          provide: FinancialReportService,
          useValue: {
            getProfitAndLoss: jest.fn(),
            getClientStatement: jest.fn(),
            getVendorStatement: jest.fn(),
            getEmployeeStatement: jest.fn(),
            getPackageProfitability: jest.fn(),
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

  it('should have class-level ADMIN and OPS_MANAGER roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FinancialReportController);
    expect(roles).toEqual([Role.ADMIN, Role.OPS_MANAGER]);
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

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, FinancialReportController.prototype.getProfitAndLoss);
      expect(roles).toEqual([Role.ADMIN]);
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

    it('should require ADMIN role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, FinancialReportController.prototype.getProfitAndLossPdf);
      expect(roles).toEqual([Role.ADMIN]);
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

  describe('getClientStatement', () => {
    it('should call service with client statement query', async () => {
      financialReportService.getClientStatement.mockResolvedValue(mockStatementResponse);

      const query: ClientStatementQueryDto = {
        clientId: 'client-1',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await controller.getClientStatement(query);

      expect(financialReportService.getClientStatement).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockStatementResponse);
    });
  });

  describe('getVendorStatement', () => {
    it('should call service with vendor statement query', async () => {
      financialReportService.getVendorStatement.mockResolvedValue(mockStatementResponse);

      const query: VendorStatementQueryDto = {
        vendorId: 'vendor-1',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await controller.getVendorStatement(query);

      expect(financialReportService.getVendorStatement).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockStatementResponse);
    });
  });

  describe('getEmployeeStatement', () => {
    it('should call service with employee statement query', async () => {
      financialReportService.getEmployeeStatement.mockResolvedValue(mockStatementResponse);

      const query: EmployeeStatementQueryDto = {
        userId: 'user-1',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await controller.getEmployeeStatement(query);

      expect(financialReportService.getEmployeeStatement).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockStatementResponse);
    });
  });

  describe('getPackageProfitability', () => {
    it('should call service with profitability query and return report', async () => {
      financialReportService.getPackageProfitability.mockResolvedValue(mockProfitabilityResponse);

      const query: ProfitabilityQueryDto = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      };

      const result = await controller.getPackageProfitability(query);

      expect(financialReportService.getPackageProfitability).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockProfitabilityResponse);
    });
  });

  describe('RBAC Regression Tests', () => {
    let reflector: Reflector;
    let guard: RolesGuard;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [FinancialReportController],
        providers: [
          {
            provide: FinancialReportService,
            useValue: {
              getProfitAndLoss: jest.fn(),
              getClientStatement: jest.fn(),
              getVendorStatement: jest.fn(),
              getEmployeeStatement: jest.fn(),
              getPackageProfitability: jest.fn(),
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
      reflector = module.get<Reflector>(Reflector);
      guard = new RolesGuard(reflector);
    });

    it('should block OPS_MANAGER from accessing P&L endpoint (ADMIN only)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.OPS_MANAGER } }),
        }),
        getHandler: () => ({}),
        getClass: () => FinancialReportController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('should allow ADMIN to access P&L endpoint', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: Role.ADMIN } }),
        }),
        getHandler: () => ({}),
        getClass: () => FinancialReportController,
      } as unknown as Parameters<typeof guard.canActivate>[0];

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [Role.ADMIN];
        }
        return undefined;
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
