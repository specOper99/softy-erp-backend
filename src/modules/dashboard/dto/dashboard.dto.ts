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
