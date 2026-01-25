import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { getDatabaseConnectionConfig } from './db-config';
// Import all entities
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { Client } from '../modules/bookings/entities/client.entity';
import { PackageItem } from '../modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { TaskType } from '../modules/catalog/entities/task-type.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Invoice } from '../modules/finance/entities/invoice.entity';
import { Payout } from '../modules/finance/entities/payout.entity';
import { RecurringTransaction } from '../modules/finance/entities/recurring-transaction.entity';
import { TransactionCategory } from '../modules/finance/entities/transaction-category.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { PayrollRun } from '../modules/hr/entities/payroll-run.entity';
import { Profile } from '../modules/hr/entities/profile.entity';
import { EmailTemplate } from '../modules/mail/entities/email-template.entity';
import { Attachment } from '../modules/media/entities/attachment.entity';
import { NotificationPreference } from '../modules/notifications/entities/notification-preference.entity';
import { Consent } from '../modules/privacy/entities/consent.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { TimeEntry } from '../modules/tasks/entities/time-entry.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';
import { User } from '../modules/users/entities/user.entity';

// Missing entities added
import { DailyMetrics } from '../modules/analytics/entities/daily-metrics.entity';
import { EmailVerificationToken } from '../modules/auth/entities/email-verification-token.entity';
import { PasswordResetToken } from '../modules/auth/entities/password-reset-token.entity';
import { BillingCustomer } from '../modules/billing/entities/billing-customer.entity';
import { PaymentMethod } from '../modules/billing/entities/payment-method.entity';
import { Subscription as BillingSubscription } from '../modules/billing/entities/subscription.entity';
import { UsageRecord } from '../modules/billing/entities/usage-record.entity';
import { UserPreference } from '../modules/dashboard/entities/user-preference.entity';
import { DepartmentBudget } from '../modules/finance/entities/department-budget.entity';
import { Attendance } from '../modules/hr/entities/attendance.entity';
import { PerformanceReview } from '../modules/hr/entities/performance-review.entity';
import { PlatformAuditLog } from '../modules/platform/entities/platform-audit-log.entity';
import { PlatformSession } from '../modules/platform/entities/platform-session.entity';
import { PlatformUser } from '../modules/platform/entities/platform-user.entity';
import { PrivacyRequest } from '../modules/privacy/entities/privacy-request.entity';
import { TaskTemplate } from '../modules/tasks/entities/task-template.entity';
import { Subscription as TenantSubscription } from '../modules/tenants/entities/subscription.entity';
import { WebhookDelivery } from '../modules/webhooks/entities/webhook-delivery.entity';
import { Webhook } from '../modules/webhooks/entities/webhook.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...getDatabaseConnectionConfig(),
  entities: [
    Tenant,
    User,
    Profile,
    PayrollRun,
    ServicePackage,
    PackageItem,
    TaskType,
    Booking,
    Client,
    Task,
    TimeEntry,
    OutboxEvent,
    Transaction,
    TransactionCategory,
    RecurringTransaction,
    Payout,
    EmployeeWallet,
    AuditLog,
    RefreshToken,
    Attachment,
    Invoice,
    EmailTemplate,
    NotificationPreference,
    Consent,
    DailyMetrics,
    EmailVerificationToken,
    PasswordResetToken,
    BillingCustomer,
    PaymentMethod,
    BillingSubscription,
    UsageRecord,
    UserPreference,
    DepartmentBudget,
    Attendance,
    PerformanceReview,
    PlatformUser,
    PlatformSession,
    PlatformAuditLog,
    PrivacyRequest,
    TaskTemplate,
    TenantSubscription,
    WebhookDelivery,
    Webhook,
  ],
  migrations: ['src/database/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
  logging: process.env.DB_LOGGING === 'true',

  // CRITICAL SECURITY: Synchronize must NEVER be enabled in production
  // This prevents accidental schema changes that could cause data loss
  synchronize: (() => {
    const syncEnabled = process.env.DB_SYNCHRONIZE === 'true';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (syncEnabled && nodeEnv === 'production') {
      throw new Error(
        'CRITICAL SECURITY VIOLATION: Database synchronization ' +
          '(DB_SYNCHRONIZE=true) is NOT allowed in production environments. ' +
          'This setting can cause unintended schema changes and DATA LOSS. ' +
          'Current configuration: DB_SYNCHRONIZE=true, NODE_ENV=production. ' +
          'Please set DB_SYNCHRONIZE=false in your production environment variables.',
      );
    }

    // Disable auto-synchronize in test environment to manually control it in global setup
    return false;
  })(),
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
