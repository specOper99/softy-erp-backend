import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum ReportPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export enum ExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: ReportPeriod, default: ReportPeriod.MONTH })
  @IsEnum(ReportPeriod)
  @IsOptional()
  period?: ReportPeriod = ReportPeriod.MONTH;

  @ApiPropertyOptional({
    description: 'Start date for custom period (ISO 8601)',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for custom period (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class ExportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.CSV })
  @IsEnum(ExportFormat)
  @IsOptional()
  format?: ExportFormat = ExportFormat.CSV;
}

// Response DTOs
export class RevenueSummaryDto {
  month: string;
  revenue: number;
  payouts: number;
  net: number;
}

export class StaffPerformanceDto {
  staffName: string;
  completedTasks: number;
  totalCommission: number;
}

export class PackageStatsDto {
  packageName: string;
  bookingCount: number;
  totalRevenue: number;
}

export class BookingTrendDto {
  date: string;
  totalBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
}

export class RevenueStatsDto {
  totalRevenue: number;
  totalExpenses: number;
  totalPayroll: number;
  netProfit: number;
  revenueByMonth: RevenueSummaryDto[];
}

export class DashboardKpiDto {
  totalRevenue: number;
  totalBookings: number;
  taskCompletionRate: number;
  averageBookingValue: number;
  activeStaffCount: number;
}
