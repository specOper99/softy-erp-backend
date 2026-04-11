import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty()
  month: string;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  payouts: number;

  @ApiProperty()
  net: number;
}

export class StaffPerformanceDto {
  @ApiProperty()
  staffName: string;

  @ApiProperty()
  completedTasks: number;

  @ApiProperty()
  totalCommission: number;
}

export class PackageStatsDto {
  @ApiProperty()
  packageName: string;

  @ApiProperty()
  bookingCount: number;

  @ApiProperty()
  totalRevenue: number;
}

export class BookingTrendDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  totalBookings: number;

  @ApiProperty()
  confirmedBookings: number;

  @ApiProperty()
  completedBookings: number;

  @ApiProperty()
  cancelledBookings: number;
}

export class RevenueStatsDto {
  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  totalExpenses: number;

  @ApiProperty()
  totalPayroll: number;

  @ApiProperty()
  netProfit: number;

  @ApiProperty({ type: [RevenueSummaryDto] })
  revenueByMonth: RevenueSummaryDto[];
}

export class DashboardKpiDto {
  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  totalBookings: number;

  @ApiProperty()
  taskCompletionRate: number;

  @ApiProperty()
  averageBookingValue: number;

  @ApiProperty()
  activeStaffCount: number;
}

export class StudioKpisDto {
  // Bookings
  @ApiProperty()
  totalBookings: number;

  @ApiProperty()
  pendingBookings: number;

  @ApiProperty()
  confirmedBookings: number;

  @ApiProperty()
  todayBookings: number;

  // Tasks
  @ApiProperty()
  totalTasks: number;

  @ApiProperty()
  pendingTasks: number;

  @ApiProperty()
  inProgressTasks: number;

  @ApiProperty()
  todayTasks: number;

  // Staff
  @ApiProperty()
  totalStaff: number;

  @ApiProperty()
  activeStaff: number;

  @ApiProperty()
  onLeaveStaff: number;

  // Revenue
  @ApiProperty()
  totalRevenue: number;

  @ApiProperty()
  monthlyRevenue: number;

  // Notifications
  @ApiProperty()
  unreadNotifications: number;

  // Timestamp
  @ApiProperty()
  generatedAt: Date;
}
