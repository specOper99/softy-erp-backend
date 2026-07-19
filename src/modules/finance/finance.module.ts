import { Module, forwardRef } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommonModule } from '../../common/common.module';
import {
  TENANT_REPO_PAYOUT,
  TENANT_REPO_PURCHASE_INVOICE,
  TENANT_REPO_TRANSACTION_CATEGORY,
  TENANT_REPO_VENDOR,
} from '../../common/constants/tenant-repo.tokens';
import { OUTBOX_INVOICE_CONSUMER } from '../../common/outbox/outbox-consumer.port';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Booking } from '../bookings/domain/entities/booking.entity';
import { BookingRepository } from '../bookings/infrastructure/booking.repository';
import { TenantsModule } from '../tenants/tenants.module';
import { FinancialReportController } from './api/financial-report.controller';
import { InvoiceController } from './api/invoice.controller';
import { PurchaseInvoicesController } from './api/purchase-invoices.controller';
import { RecurringTransactionController } from './api/recurring-transaction.controller';
import { TransactionCategoriesController } from './api/transaction-categories.controller';
import { TransactionsController } from './api/transactions.controller';
import { VendorsController } from './api/vendors.controller';
import { WalletsController } from './api/wallets.controller';
import {
  DepartmentBudget,
  EmployeeWallet,
  Invoice,
  Payout,
  PurchaseInvoice,
  RecurringTransaction,
  Transaction,
  Vendor,
} from './domain/entities';
import { TransactionCategory } from './domain/entities/transaction-category.entity';
import { DepartmentBudgetRepository } from './infrastructure/department-budget.repository';
import { InvoiceRepository } from './infrastructure/invoice.repository';
import { PayoutRepository } from './infrastructure/payout.repository';
import { PurchaseInvoiceRepository } from './infrastructure/purchase-invoice.repository';
import { RecurringTransactionRepository } from './infrastructure/recurring-transaction.repository';
import { TransactionCategoryRepository } from './infrastructure/transaction-category.repository';
import { TransactionRepository } from './infrastructure/transaction.repository';
import { VendorRepository } from './infrastructure/vendor.repository';
import { WalletRepository } from './infrastructure/wallet.repository';
import { CurrencyService } from './application/currency.service';
import { FinanceService } from './application/finance.service';
import { FinancialReportService } from './application/financial-report.service';
import { InvoiceService } from './application/invoice.service';
import { PurchaseInvoicesService } from './application/purchase-invoices.service';
import { RecurringTransactionService } from './application/recurring-transaction.service';
import { TransactionCategoriesService } from './application/transaction-categories.service';
import { VendorsService } from './application/vendors.service';
import { WalletService } from './application/wallet.service';

import { ExportService } from '../../common/services/export.service';

import { createPaymentGatewayProviders } from '../hr/application/payment-gateway.service';
import { MetricsModule } from '../metrics/metrics.module';
import { PayoutConsistencyCron } from './infrastructure/payout-consistency.cron';
import { BookingUpdatedHandler } from './infrastructure/booking-updated.handler';
import { ReconciliationFailedHandler } from './infrastructure/financial-failure.handler';
import { BookingPriceChangedHandler } from './infrastructure/booking-price-changed.handler';
import { PayoutRelayService } from './application/payout-relay.service';
import { OutboxInvoiceGenerationConsumer } from './infrastructure/outbox-invoice-generation.consumer';

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
    forwardRef(() => CommonModule),
    TenantsModule,
    AnalyticsModule,
    MetricsModule,
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
    VendorRepository,
    TransactionCategoryRepository,
    ...createPaymentGatewayProviders(),
    PayoutConsistencyCron,
    BookingUpdatedHandler,
    ReconciliationFailedHandler,
    BookingPriceChangedHandler,
    OutboxInvoiceGenerationConsumer,
    {
      provide: OUTBOX_INVOICE_CONSUMER,
      useExisting: OutboxInvoiceGenerationConsumer,
    },
    {
      provide: TENANT_REPO_PURCHASE_INVOICE,
      useFactory: (repo: Repository<PurchaseInvoice>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(PurchaseInvoice)],
    },
    {
      provide: TENANT_REPO_PAYOUT,
      useFactory: (repo: Repository<Payout>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Payout)],
    },
    {
      provide: TENANT_REPO_VENDOR,
      useFactory: (repo: Repository<Vendor>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(Vendor)],
    },
    {
      provide: TENANT_REPO_TRANSACTION_CATEGORY,
      useFactory: (repo: Repository<TransactionCategory>) => new TenantAwareRepository(repo),
      inject: [getRepositoryToken(TransactionCategory)],
    },
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
    OUTBOX_INVOICE_CONSUMER,
  ],
})
export class FinanceModule {}
