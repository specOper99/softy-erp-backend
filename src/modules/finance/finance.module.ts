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
import { DepartmentBudget, EmployeeWallet, Invoice, Payout, RecurringTransaction, Transaction } from './entities';
import { TransactionCategory } from './entities/transaction-category.entity';
import { DepartmentBudgetRepository } from './repositories/department-budget.repository';
import { InvoiceRepository } from './repositories/invoice.repository';
import { RecurringTransactionRepository } from './repositories/recurring-transaction.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { CurrencyService } from './services/currency.service';
import { FinanceService } from './services/finance.service';
import { FinancialReportService } from './services/financial-report.service';
import { InvoiceService } from './services/invoice.service';
import { RecurringTransactionService } from './services/recurring-transaction.service';
import { WalletService } from './services/wallet.service';

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
    InvoiceRepository,
    ExportService,
    RecurringTransactionService,
    DepartmentBudgetRepository,
    TransactionRepository,
    RecurringTransactionRepository,
    WalletService,
    WalletRepository,
    FinancialReportService,
  ],
  exports: [
    FinanceService,
    CurrencyService,
    InvoiceService,
    InvoiceRepository,
    InvoiceRepository,
    RecurringTransactionService,
    RecurringTransactionRepository,
    DepartmentBudgetRepository,
    TransactionRepository,
    WalletService,
    WalletRepository,
    FinancialReportService,
  ],
})
export class FinanceModule {}
