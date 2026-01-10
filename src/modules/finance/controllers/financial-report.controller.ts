import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { Role } from '../../users/enums/role.enum';
import { FinancialReportFilterDto } from '../dto/financial-report.dto';
import { FinancialReportService } from '../services/financial-report.service';

@ApiTags('Financial Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPS_MANAGER)
@Controller('finance/reports')
export class FinancialReportController {
  constructor(
    private readonly financialReportService: FinancialReportService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('pnl')
  @ApiOperation({ summary: 'Get Profit & Loss Report (JSON)' })
  async getProfitAndLoss(@Query() filter: FinancialReportFilterDto) {
    return this.financialReportService.getProfitAndLoss(filter);
  }

  @Get('pnl/pdf')
  @ApiOperation({ summary: 'Get Profit & Loss Report (PDF)' })
  async getProfitAndLossPdf(
    @Query() filter: FinancialReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.financialReportService.getProfitAndLoss(filter);
    const pdfBytes = await this.reportGeneratorService.generatePnLPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=profit_and_loss.pdf',
      'Content-Length': pdfBytes.length,
    });
    res.end(Buffer.from(pdfBytes));
  }

  @Get('revenue-by-package')
  @ApiOperation({ summary: 'Get Revenue by Package Report (JSON)' })
  async getRevenueByPackage(@Query() filter: FinancialReportFilterDto) {
    return this.analyticsService.getRevenueByPackage(filter);
  }

  @Get('revenue-by-package/pdf')
  @ApiOperation({ summary: 'Get Revenue by Package Report (PDF)' })
  async getRevenueByPackagePdf(
    @Query() filter: FinancialReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.analyticsService.getRevenueByPackage(filter);
    const pdfBytes =
      await this.reportGeneratorService.generateRevenueByPackagePdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=revenue_by_package.pdf',
      'Content-Length': pdfBytes.length,
    });
    res.end(Buffer.from(pdfBytes));
  }
}
