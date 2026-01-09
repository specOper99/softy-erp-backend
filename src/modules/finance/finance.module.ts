import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Booking } from '../bookings/entities/booking.entity';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TenantsModule } from '../tenants/tenants.module';
import { FinancialReportController } from './controllers/financial-report.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { RecurringTransactionController } from './controllers/recurring-transaction.controller';
import { TransactionsController } from './controllers/transactions.controller';
import { WalletsController } from './controllers/wallets.controller';
import {
  DepartmentBudget,
  EmployeeWallet,
  Invoice,
  Payout,
  RecurringTransaction,
  Transaction,
  TransactionCategory,
} from './entities';
import { CurrencyService } from './services/currency.service';
import { FinanceService } from './services/finance.service';
import { InvoiceService } from './services/invoice.service';
import { RecurringTransactionService } from './services/recurring-transaction.service';

import { ExportService } from '../../common/services/export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      TransactionCategory,
      RecurringTransaction,
      EmployeeWallet,
      Payout,
      DepartmentBudget,
      Invoice,
      Booking,
    ]),
    TenantsModule,
    DashboardModule,
    AnalyticsModule,
  ],
  controllers: [
    TransactionsController,
    WalletsController,
    InvoiceController,
    FinancialReportController,
    RecurringTransactionController,
  ],
  providers: [
    FinanceService,
    CurrencyService,
    InvoiceService,
    ExportService,
    RecurringTransactionService,
  ],
  exports: [
    FinanceService,
    CurrencyService,
    InvoiceService,
    RecurringTransactionService,
  ],
})
export class FinanceModule {}
