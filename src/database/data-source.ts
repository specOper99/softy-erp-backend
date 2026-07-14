import 'dotenv/config';
import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';
import { DataSource } from 'typeorm';
import { getDatabaseConnectionConfig } from './db-config';
import { patchTypeOrmMigrationOrdering } from './patch-typeorm-migration-order';
// Import all entities
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { ConsumerInbox } from '../common/entities/consumer-inbox.entity';
import { AuditLog } from '../modules/audit/domain/entities';
import { RefreshToken } from '../modules/auth/domain/entities/refresh-token.entity';
import { Booking } from '../modules/bookings/domain/entities/booking.entity';
import { Client } from '../modules/clients/domain/entities/client.entity';
import { ProcessingType } from '../modules/bookings/domain/entities/processing-type.entity';
import { ServicePackage } from '../modules/catalog/domain/entities/service-package.entity';
import { EmployeeWallet } from '../modules/finance/domain/entities/employee-wallet.entity';
import { Invoice } from '../modules/finance/domain/entities/invoice.entity';
import { Payout } from '../modules/finance/domain/entities/payout.entity';
import { PurchaseInvoice } from '../modules/finance/domain/entities/purchase-invoice.entity';
import { RecurringTransaction } from '../modules/finance/domain/entities/recurring-transaction.entity';
import { TransactionCategory } from '../modules/finance/domain/entities/transaction-category.entity';
import { Transaction } from '../modules/finance/domain/entities/transaction.entity';
import { Vendor } from '../modules/finance/domain/entities/vendor.entity';
import { PayrollRun } from '../modules/hr/domain/entities/payroll-run.entity';
import { Profile } from '../modules/hr/domain/entities/profile.entity';
import { EmailTemplate } from '../modules/mail/domain/entities';
import { NotificationPreference } from '../modules/notifications/domain/entities/notification-preference.entity';
import { Notification } from '../modules/notifications/domain/entities/notification.entity';
import { TaskAssignee } from '../modules/tasks/domain/entities/task-assignee.entity';
import { Task } from '../modules/tasks/domain/entities/task.entity';
import { TimeEntry } from '../modules/tasks/domain/entities/time-entry.entity';
import { Tenant } from '../modules/tenants/domain/entities/tenant.entity';
import { User } from '../modules/users/domain/entities/user.entity';

// Missing entities added
import { RuntimeFailure } from '../common/errors/runtime-failure';
import { DailyMetrics } from '../modules/analytics/domain/entities/daily-metrics.entity';
import { EmailVerificationToken } from '../modules/auth/domain/entities/email-verification-token.entity';
import { PasswordResetToken } from '../modules/auth/domain/entities/password-reset-token.entity';
import { UserPreference } from '../modules/dashboard/domain/entities/user-preference.entity';
import { DepartmentBudget } from '../modules/finance/domain/entities/department-budget.entity';
import { Attendance } from '../modules/hr/domain/entities/attendance.entity';
import { PerformanceReview } from '../modules/hr/domain/entities/performance-review.entity';
import { ProcessingTypeEligibility } from '../modules/hr/domain/entities/processing-type-eligibility.entity';
import { TaskTemplate } from '../modules/tasks/domain/entities/task-template.entity';
import { Subscription as TenantSubscription } from '../modules/tenants/domain/entities/subscription.entity';
import { TenantLifecycleEvent } from '../modules/platform/domain/entities/tenant-lifecycle-event.entity';
import { ImpersonationSession } from '../modules/platform/domain/entities/impersonation-session.entity';
import { PlatformAuditLog } from '../modules/platform/domain/entities/platform-audit-log.entity';
import { PlatformUser } from '../modules/platform/domain/entities/platform-user.entity';
import { PlatformRefreshToken } from '../modules/platform/domain/entities/platform-refresh-token.entity';
import { PrivacyRequest } from '../modules/privacy/domain/entities/privacy-request.entity';

patchTypeOrmMigrationOrdering();

export const ALL_ENTITIES = [
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
  ConsumerInbox,
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
  TenantLifecycleEvent,
  ImpersonationSession,
  PlatformAuditLog,
  PlatformUser,
  PlatformRefreshToken,
  PrivacyRequest,
];

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...getDatabaseConnectionConfig(),
  entities: ALL_ENTITIES,
  migrations: [join(__dirname, 'migrations', '[0-9]*.{ts,js}')],
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'each',
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
