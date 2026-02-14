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
import { CommonModule } from './common/common.module';
import { IpRateLimitGuard } from './common/guards/ip-rate-limit.guard';
import { I18nModule } from './common/i18n';
import { ApiVersionInterceptor } from './common/interceptors/api-version.interceptor';
import { MessagePackInterceptor } from './common/interceptors/message-pack.interceptor';
import { StructuredLoggingInterceptor } from './common/interceptors/structured-logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { QueueModule } from './common/queue/queue.module';
import { TenantGuard } from './modules/tenants/guards/tenant.guard';
import { TenantMiddleware } from './modules/tenants/middleware/tenant.middleware';

// Feature module imports
import { ResilienceModule } from './common/resilience/resilience.module';
import authConfig from './config/auth.config';
import { CoreModule } from './modules/core/core.module';

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
    CommonModule,
    CoreModule,
    I18nModule,
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
    {
      provide: APP_GUARD,
      useClass: IpRateLimitGuard,
    },
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
  }
}
