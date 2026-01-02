import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, seconds, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentryModule } from '@sentry/nestjs/setup';
import { databaseConfig } from './config';
import { validate } from './config/env-validation';
import { vaultLoader } from './config/vault.loader';

// Common imports
import { GlobalCacheInterceptor } from './common/cache/cache.interceptor';
import { AppCacheModule } from './common/cache/cache.module';
import { IpRateLimitGuard } from './common/guards/ip-rate-limit.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { LoggerModule } from './common/logger/logger.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantsModule } from './modules/tenants/tenants.module';

// Feature module imports
import { ResilienceModule } from './common/resilience/resilience.module';
import authConfig from './config/auth.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { HrModule } from './modules/hr/hr.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { MetricsModule } from './modules/metrics/metrics.module';
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

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        autoLoadEntities: true,
        synchronize: configService.get<boolean>('database.synchronize'),
        logging: configService.get<boolean>('database.logging'),
      }),
    }),

    // Scheduler for Cron jobs
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    UsersModule,
    CatalogModule,
    BookingsModule,
    TasksModule,
    FinanceModule,
    HrModule,
    MailModule,
    DashboardModule,
    AuditModule,
    MediaModule,
    HealthModule,
    TenantsModule,
    WebhooksModule,
    MetricsModule,
    ResilienceModule.forRoot([
      {
        name: 's3',
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
      },
      {
        name: 'mail',
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
      },
    ]),
  ],
  providers: [
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

    { provide: APP_INTERCEPTOR, useClass: GlobalCacheInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
