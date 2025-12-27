import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import {
  PackageStatsDto,
  RevenueSummaryDto,
  StaffPerformanceDto,
} from './dto/dashboard.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPS_MANAGER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get monthly revenue vs payouts summary' })
  async getSummary(): Promise<RevenueSummaryDto[]> {
    return this.dashboardService.getRevenueSummary();
  }

  @Get('staff-performance')
  @ApiOperation({ summary: 'Get staff performance ranking' })
  async getStaffPerformance(): Promise<StaffPerformanceDto[]> {
    return this.dashboardService.getStaffPerformance();
  }

  @Get('package-stats')
  @ApiOperation({ summary: 'Get service package popularity and revenue' })
  async getPackageStats(): Promise<PackageStatsDto[]> {
    return this.dashboardService.getPackageStats();
  }
}
