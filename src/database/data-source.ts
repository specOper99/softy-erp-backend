import 'dotenv/config';
import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';
import { DataSource } from 'typeorm';
import { getDatabaseConnectionConfig } from './db-config';
// Import all entities
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { Client } from '../modules/bookings/entities/client.entity';
import { ProcessingType } from '../modules/bookings/entities/processing-type.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Invoice } from '../modules/finance/entities/invoice.entity';
import { Payout } from '../modules/finance/entities/payout.entity';
import { PurchaseInvoice } from '../modules/finance/entities/purchase-invoice.entity';
import { RecurringTransaction } from '../modules/finance/entities/recurring-transaction.entity';
import { TransactionCategory } from '../modules/finance/entities/transaction-category.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { Vendor } from '../modules/finance/entities/vendor.entity';
import { PayrollRun } from '../modules/hr/entities/payroll-run.entity';
import { Profile } from '../modules/hr/entities/profile.entity';
import { EmailTemplate } from '../modules/mail/entities/email-template.entity';
import { NotificationPreference } from '../modules/notifications/entities/notification-preference.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { TaskAssignee } from '../modules/tasks/entities/task-assignee.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { TimeEntry } from '../modules/tasks/entities/time-entry.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';
import { User } from '../modules/users/entities/user.entity';

// Missing entities added
import { RuntimeFailure } from '../common/errors/runtime-failure';
import { DailyMetrics } from '../modules/analytics/entities/daily-metrics.entity';
import { EmailVerificationToken } from '../modules/auth/entities/email-verification-token.entity';
import { PasswordResetToken } from '../modules/auth/entities/password-reset-token.entity';
import { UserPreference } from '../modules/dashboard/entities/user-preference.entity';
import { DepartmentBudget } from '../modules/finance/entities/department-budget.entity';
import { Attendance } from '../modules/hr/entities/attendance.entity';
import { PerformanceReview } from '../modules/hr/entities/performance-review.entity';
import { ProcessingTypeEligibility } from '../modules/hr/entities/processing-type-eligibility.entity';
import { TaskTemplate } from '../modules/tasks/entities/task-template.entity';
import { Subscription as TenantSubscription } from '../modules/tenants/entities/subscription.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...getDatabaseConnectionConfig(),
  entities: [
    Tenant,
    User,
    Profile,
    PayrollRun,
    ServicePackage,
    Booking,
    Client,
    ProcessingType,
    Task,
    TaskAssignee,
    TimeEntry,
    OutboxEvent,
    Transaction,
    TransactionCategory,
    RecurringTransaction,
    Payout,
    EmployeeWallet,
    AuditLog,
    RefreshToken,
    Invoice,
    PurchaseInvoice,
    Vendor,
    EmailTemplate,
    Notification,
    NotificationPreference,
    DailyMetrics,
    EmailVerificationToken,
    PasswordResetToken,
    UserPreference,
    DepartmentBudget,
    Attendance,
    PerformanceReview,
    ProcessingTypeEligibility,
    TaskTemplate,
    TenantSubscription,
  ],
  migrations: [join(__dirname, 'migrations', '[0-9]*.{ts,js}')],
  migrationsTableName: 'migrations',
  logging: process.env.DB_LOGGING === 'true',

  // CRITICAL SECURITY: synchronize is unconditionally disabled in all environments.
  // Schema changes must only happen through TypeORM migrations.
  synchronize: (() => {
    if (process.env.DB_SYNCHRONIZE === 'true') {
      throw new RuntimeFailure(
        'CRITICAL SECURITY VIOLATION: DB_SYNCHRONIZE=true is forbidden in all environments. ' +
          'Schema changes must go through migrations only. ' +
          'Remove DB_SYNCHRONIZE from your environment variables.',
      );
    }
    return false;
  })(),
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
