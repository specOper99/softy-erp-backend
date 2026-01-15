import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, seconds, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentryModule } from '@sentry/nestjs/setup';
import { RESILIENCE_CONSTANTS } from './common/constants';
import { databaseConfig } from './config';
import { validate } from './config/env-validation';
import { vaultLoader } from './config/vault.loader';

// Common imports
import { AppCacheModule } from './common/cache/cache.module';
import { IpRateLimitGuard } from './common/guards/ip-rate-limit.guard';
import { I18nModule } from './common/i18n';
import { ApiVersionInterceptor } from './common/interceptors/api-version.interceptor';
import { MessagePackInterceptor } from './common/interceptors/message-pack.interceptor';
import { StructuredLoggingInterceptor } from './common/interceptors/structured-logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { QueueModule } from './common/queue/queue.module';
import { TenantGuard } from './modules/tenants/guards/tenant.guard';
import { TenantMiddleware } from './modules/tenants/middleware/tenant.middleware';
import { TenantsModule } from './modules/tenants/tenants.module';

// Feature module imports
import { ResilienceModule } from './common/resilience/resilience.module';
import authConfig from './config/auth.config';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { HrModule } from './modules/hr/hr.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    // Sentry error tracking (must be first)
    SentryModule.forRoot(),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [vaultLoader, databaseConfig, authConfig],
      validate,
    }),

    // CQRS Event Bus
    CqrsModule.forRoot(),

    // Structured Logging with Winston
    LoggerModule,

    // Caching (Redis or in-memory)
    AppCacheModule,

    // Background job processing (BullMQ with Redis)
    QueueModule,

    // Rate Limiting - Global: 60 requests per minute
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: seconds(1),
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: seconds(10),
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: minutes(1),
        limit: 100, // 100 requests per minute
      },
    ]),

    // Database with Read Replica support
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const replication = configService.get<
          | {
              master: {
                host: string;
                port: number;
                username: string;
                password: string;
                database: string;
              };
              slaves: Array<{
                host: string;
                port: number;
                username: string;
                password: string;
                database: string;
              }>;
            }
          | undefined
        >('database.replication');

        const baseOptions = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: configService.get<boolean>('database.synchronize'),
          logging: configService.get<boolean>('database.logging'),
          logger: configService.get<boolean>('database.logging') ? ('advanced-console' as const) : undefined,
          maxQueryExecutionTime: 100,
          extra: configService.get<Record<string, unknown>>('database.extra'),
        };

        if (replication) {
          return {
            ...baseOptions,
            replication: replication,
          };
        }

        return {
          ...baseOptions,
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
        };
      },
    }),

    // Scheduler for Cron jobs
    ScheduleModule.forRoot(),

    // Feature Modules
    AdminModule,
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
    MediaModule,
    HealthModule,
    AnalyticsModule,
    TenantsModule,
    WebhooksModule,
    MetricsModule,
    I18nModule,
    ClientPortalModule,
    PrivacyModule,
    BillingModule,
    ResilienceModule.forRoot([
      {
        name: 's3',
        timeout: RESILIENCE_CONSTANTS.S3_TIMEOUT,
        errorThresholdPercentage: 50,
        resetTimeout: RESILIENCE_CONSTANTS.RESET_TIMEOUT_Short,
      },
      {
        name: 'mail',
        timeout: RESILIENCE_CONSTANTS.MAIL_TIMEOUT,
        errorThresholdPercentage: 50,
        resetTimeout: RESILIENCE_CONSTANTS.RESET_TIMEOUT_LONG,
      },
      {
        name: 'database',
        timeout: RESILIENCE_CONSTANTS.DB_TIMEOUT,
        errorThresholdPercentage: 50,
        resetTimeout: RESILIENCE_CONSTANTS.RESET_TIMEOUT_LONG,
      },
    ]),
  ],
  providers: [
    // Middleware providers for DI
    CorrelationIdMiddleware,
    TenantMiddleware,
    CsrfMiddleware,
    // Apply rate limiting globally
    // Use explicit DISABLE_RATE_LIMITING env var for test environments
    // to prevent accidental disabling if NODE_ENV=test leaks to production
    ...(process.env.DISABLE_RATE_LIMITING === 'true'
      ? []
      : [
          {
            provide: APP_GUARD,
            useClass: IpRateLimitGuard,
          },
        ]),
    // Graceful shutdown handler

    { provide: APP_GUARD, useClass: TenantGuard },

    // Global interceptors for observability
    { provide: APP_INTERCEPTOR, useClass: MessagePackInterceptor },
    { provide: APP_INTERCEPTOR, useClass: StructuredLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ApiVersionInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(TenantMiddleware).forRoutes('*');
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
