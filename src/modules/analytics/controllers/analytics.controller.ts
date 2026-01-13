import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReportGeneratorService } from '../../dashboard/services/report-generator.service';
import { FinancialReportFilterDto } from '../../finance/dto/financial-report.dto';
import { SubscriptionPlan } from '../../tenants/enums/subscription-plan.enum';
import { RequireSubscription, SubscriptionGuard } from '../../tenants/guards/subscription.guard';
import { Role } from '../../users/enums/role.enum';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireSubscription(SubscriptionPlan.PRO)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportGeneratorService: ReportGeneratorService,
  ) {}

  @Get('revenue-by-package')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get Revenue by Package Report (JSON)' })
  async getRevenueByPackage(@Query() filter: FinancialReportFilterDto) {
    return this.analyticsService.getRevenueByPackage(filter);
  }

  @Get('revenue-by-package/pdf')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get Revenue by Package Report (PDF)' })
  async getRevenueByPackagePdf(@Query() filter: FinancialReportFilterDto, @Res() res: Response) {
    const data = await this.analyticsService.getRevenueByPackage(filter);
    const pdfBytes = await this.reportGeneratorService.generateRevenueByPackagePdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=revenue_by_package.pdf',
      'Content-Length': pdfBytes.length,
    });
    res.end(Buffer.from(pdfBytes));
  }

  @Get('tax-report')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Tax Report (JSON)' })
  async getTaxReport(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.analyticsService.getTaxReport(startDate, endDate);
  }
}
