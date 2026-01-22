import { TransactionType } from '../enums/transaction-type.enum';

export interface TaxReportRaw {
  totalTax: string | null;
  totalSubTotal: string | null;
  totalGross: string | null;
}

export interface PnLTransactionRaw {
  type: TransactionType;
  period: string;
  total: string;
}

export interface PnLEntry {
  period: string;
  income: number;
  expenses: number;
  payroll: number;
  net: number;
}

export interface RevenueByPackageRaw {
  packageName: string | null;
  bookingCount: string;
  totalRevenue: string;
}

export interface RevenueByPackageEntry {
  packageName: string;
  bookingCount: number;
  totalRevenue: number;
}

export interface BudgetSpendingRaw {
  total: string | null;
}
