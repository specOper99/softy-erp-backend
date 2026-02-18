import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PdfUtils } from '../../../common/utils/pdf.utils';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { Role } from '../../users/enums/role.enum';
import { FinancialReportFilterDto } from '../dto/financial-report.dto';
import { ProfitabilityQueryDto } from '../dto/profitability.dto';
import { ClientStatementQueryDto, EmployeeStatementQueryDto, VendorStatementQueryDto } from '../dto/statement.dto';
import { FinancialReportService } from '../services/financial-report.service';

@ApiTags('Financial Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPS_MANAGER)
@MfaRequired()
@Controller('finance/reports')
export class FinancialReportController {
  constructor(
    private readonly financialReportService: FinancialReportService,
    private readonly reportGeneratorService: ReportGeneratorService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('pnl')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Profit & Loss Report (JSON)' })
  async getProfitAndLoss(@Query() filter: FinancialReportFilterDto) {
    return this.financialReportService.getProfitAndLoss(filter);
  }

  @Get('pnl/pdf')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Profit & Loss Report (PDF)' })
  async getProfitAndLossPdf(@Query() filter: FinancialReportFilterDto, @Res() res: Response) {
    const data = await this.financialReportService.getProfitAndLoss(filter);
    const pdfBytes = await this.reportGeneratorService.generatePnLPdf(data);

    PdfUtils.sendPdfResponse(res, pdfBytes, 'profit_and_loss.pdf');
  }

  @Get('revenue-by-package')
  @ApiOperation({ summary: 'Get Revenue by Package Report (JSON)' })
  async getRevenueByPackage(@Query() filter: FinancialReportFilterDto) {
    return this.analyticsService.getRevenueByPackage(filter);
  }

  @Get('revenue-by-package/pdf')
  @ApiOperation({ summary: 'Get Revenue by Package Report (PDF)' })
  async getRevenueByPackagePdf(@Query() filter: FinancialReportFilterDto, @Res() res: Response) {
    const data = await this.analyticsService.getRevenueByPackage(filter);
    const pdfBytes = await this.reportGeneratorService.generateRevenueByPackagePdf(data);

    PdfUtils.sendPdfResponse(res, pdfBytes, 'revenue_by_package.pdf');
  }

  @Get('statement/client')
  @ApiOperation({ summary: 'Get Client Statement' })
  async getClientStatement(@Query() query: ClientStatementQueryDto) {
    return this.financialReportService.getClientStatement(query);
  }

  @Get('statement/vendor')
  @ApiOperation({ summary: 'Get Vendor Statement' })
  async getVendorStatement(@Query() query: VendorStatementQueryDto) {
    return this.financialReportService.getVendorStatement(query);
  }

  @Get('statement/employee')
  @ApiOperation({ summary: 'Get Employee Statement' })
  async getEmployeeStatement(@Query() query: EmployeeStatementQueryDto) {
    return this.financialReportService.getEmployeeStatement(query);
  }

  @Get('profitability/packages')
  @ApiOperation({ summary: 'Get Offer/Package Profitability Report' })
  async getPackageProfitability(@Query() query: ProfitabilityQueryDto) {
    return this.financialReportService.getPackageProfitability(query);
  }
}
