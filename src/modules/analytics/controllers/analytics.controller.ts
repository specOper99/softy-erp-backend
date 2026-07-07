import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('tax-report')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Tax Report (JSON)' })
  async getTaxReport(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.analyticsService.getTaxReport(startDate, endDate);
  }
}
