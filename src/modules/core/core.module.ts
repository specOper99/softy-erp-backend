import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';
import { HrModule } from '../hr/hr.module';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformModule } from '../platform/platform.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { TasksModule } from '../tasks/tasks.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    AdminModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    BookingsModule,
    ReviewsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MailModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    MediaModule,
    HealthModule,
    AnalyticsModule,
    TenantsModule,
    WebhooksModule,
    MetricsModule,
    ClientPortalModule,
    PrivacyModule,
    BillingModule,
    PlatformModule,
  ],
  exports: [
    AdminModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    BookingsModule,
    ReviewsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MailModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    MediaModule,
    HealthModule,
    AnalyticsModule,
    TenantsModule,
    WebhooksModule,
    MetricsModule,
    ClientPortalModule,
    PrivacyModule,
    BillingModule,
    PlatformModule,
  ],
})
export class CoreModule {}
