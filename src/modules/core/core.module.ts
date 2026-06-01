import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';
import { HrModule } from '../hr/hr.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    BookingsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MailModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    HealthModule,
    AnalyticsModule,
    TenantsModule,
    MetricsModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    CatalogModule,
    BookingsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MailModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    HealthModule,
    AnalyticsModule,
    TenantsModule,
    MetricsModule,
  ],
})
export class CoreModule {}
