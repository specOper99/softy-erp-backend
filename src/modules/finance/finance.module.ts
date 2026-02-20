import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingRepository } from '../bookings/repositories/booking.repository';
import { TenantsModule } from '../tenants/tenants.module';
import { FinancialReportController } from './controllers/financial-report.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { PurchaseInvoicesController } from './controllers/purchase-invoices.controller';
import { RecurringTransactionController } from './controllers/recurring-transaction.controller';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionCategoriesController } from './controllers/transaction-categories.controller';
import { VendorsController } from './controllers/vendors.controller';
import { WalletsController } from './controllers/wallets.controller';
import {
  DepartmentBudget,
  EmployeeWallet,
  Invoice,
  Payout,
  PurchaseInvoice,
  RecurringTransaction,
  Transaction,
  Vendor,
} from './entities';
import { TransactionCategory } from './entities/transaction-category.entity';
import { DepartmentBudgetRepository } from './repositories/department-budget.repository';
import { InvoiceRepository } from './repositories/invoice.repository';
import { PayoutRepository } from './repositories/payout.repository';
import { PurchaseInvoiceRepository } from './repositories/purchase-invoice.repository';
import { RecurringTransactionRepository } from './repositories/recurring-transaction.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { CurrencyService } from './services/currency.service';
import { FinanceService } from './services/finance.service';
import { FinancialReportService } from './services/financial-report.service';
import { InvoiceService } from './services/invoice.service';
import { PurchaseInvoicesService } from './services/purchase-invoices.service';
import { RecurringTransactionService } from './services/recurring-transaction.service';
import { WalletService } from './services/wallet.service';
import { TransactionCategoriesService } from './services/transaction-categories.service';
import { VendorsService } from './services/vendors.service';

import { ExportService } from '../../common/services/export.service';

import { MockPaymentGatewayService } from '../hr/services/payment-gateway.service';
import { PayoutConsistencyCron } from './cron/payout-consistency.cron';
import { BookingUpdatedHandler } from './events/handlers/booking-updated.handler';
import { BookingPriceChangedHandler } from './handlers/booking-price-changed.handler';
import { PayoutRelayService } from './services/payout-relay.service';

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
      PurchaseInvoice,
      Vendor,
      Booking,
    ]),
    CommonModule,
    TenantsModule,
    AnalyticsModule,
  ],
  controllers: [
    TransactionsController,
    TransactionCategoriesController,
    WalletsController,
    InvoiceController,
    VendorsController,
    PurchaseInvoicesController,
    FinancialReportController,
    RecurringTransactionController,
  ],
  providers: [
    FinanceService,
    CurrencyService,
    TransactionCategoriesService,
    InvoiceService,
    VendorsService,
    PurchaseInvoicesService,
    InvoiceRepository,
    BookingRepository,
    ExportService,
    RecurringTransactionService,
    DepartmentBudgetRepository,
    TransactionRepository,
    RecurringTransactionRepository,
    WalletService,
    WalletRepository,
    FinancialReportService,
    PayoutRelayService,
    PayoutRepository,
    PurchaseInvoiceRepository,
    MockPaymentGatewayService,
    PayoutConsistencyCron,
    BookingUpdatedHandler,
    BookingPriceChangedHandler,
  ],
  exports: [
    FinanceService,
    CurrencyService,
    TransactionCategoriesService,
    InvoiceService,
    VendorsService,
    PurchaseInvoicesService,
    InvoiceRepository,
    RecurringTransactionService,
    RecurringTransactionRepository,
    DepartmentBudgetRepository,
    TransactionRepository,
    WalletService,
    WalletRepository,
    FinancialReportService,
    PayoutRelayService,
    PayoutRepository,
    PurchaseInvoiceRepository,
  ],
})
export class FinanceModule {}
