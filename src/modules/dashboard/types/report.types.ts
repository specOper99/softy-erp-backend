export interface PnLReportRow {
  period: string;
  income: number;
  expenses: number;
  payroll: number;
  net: number;
}

export interface RevenueByPackageRow {
  packageName: string;
  bookingCount: number;
  totalRevenue: number;
}
