import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentryModule } from '@sentry/nestjs/setup';
import Redis from 'ioredis';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { RESILIENCE_CONSTANTS } from './common/constants';
import { databaseConfig } from './config';
import { validate } from './config/env-validation';
import { vaultLoader } from './config/vault.loader';

// Common imports
import { AcceptLanguageResolver, I18nJsonLoader, I18nModule } from 'nestjs-i18n';
import { AppCacheModule } from './common/cache/cache.module';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IpRateLimitGuard } from './common/guards/ip-rate-limit.guard';
import { ApiVersionInterceptor } from './common/interceptors/api-version.interceptor';
import { MessagePackInterceptor } from './common/interceptors/message-pack.interceptor';
import { StructuredLoggingInterceptor } from './common/interceptors/structured-logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
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

    // Rate Limiting - Global: configurable via env
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const getThrottleValue = (key: string, defaultValue: number): number => {
          const value = configService.get<number | string>(key);
          if (typeof value === 'number') {
            return Number.isFinite(value) && value >= 1 ? Math.floor(value) : defaultValue;
          }
          const parsed = parseInt(String(value), 10);
          return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : defaultValue;
        };

        const throttlers = [
          {
            name: 'short',
            ttl: seconds(getThrottleValue('THROTTLE_SHORT_TTL_SECONDS', 1)),
            limit: getThrottleValue('THROTTLE_SHORT_LIMIT', 3),
          },
          {
            name: 'medium',
            ttl: seconds(getThrottleValue('THROTTLE_MEDIUM_TTL_SECONDS', 10)),
            limit: getThrottleValue('THROTTLE_MEDIUM_LIMIT', 20),
          },
          {
            name: 'long',
            ttl: seconds(getThrottleValue('THROTTLE_LONG_TTL_SECONDS', 60)),
            limit: getThrottleValue('THROTTLE_LONG_LIMIT', 100),
          },
        ];

        // Use Redis-backed storage when REDIS_URL is set so throttle counters
        // are shared across instances. Falls back to in-memory storage when
        // unset (single-process / tests).
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          return { throttlers };
        }
        return {
          throttlers,
          storage: new ThrottlerStorageRedisService(new Redis(redisUrl, { lazyConnect: true })),
        };
      },
    }),

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
          manualInitialization: configService.get<boolean>('database.manualInitialization'),
          synchronize: configService.get<boolean>('database.synchronize'),
          logging: configService.get<boolean>('database.logging'),
          logger: configService.get<boolean>('database.logging') ? ('advanced-console' as const) : undefined,
          migrations: configService.get<string[]>('database.migrations'),
          migrationsTableName: configService.get<string>('database.migrationsTableName'),
          migrationsRun: configService.get<boolean>('database.migrationsRun'),
          maxQueryExecutionTime: configService.get<number>('database.maxQueryExecutionTime'),

          retryAttempts: configService.get<number>('database.retryAttempts'),
          retryDelay: configService.get<number>('database.retryDelay'),
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
      // Register the DataSource with typeorm-transactional so future
      // `@Transactional()`-decorated services pick up the request-scoped
      // EntityManager. Returning the original instance keeps current behaviour
      // unchanged — the proxy is opt-in per service.
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('TypeOrmModule: missing DataSource options');
        return addTransactionalDataSource(new DataSource(options));
      },
    }),

    // Scheduler for Cron jobs
    ScheduleModule.forRoot(),

    // i18n — nestjs-i18n with JSON loader, resolved from Accept-Language header
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: join(__dirname, '/common/i18n/translations'),
        watch: false,
      },
      resolvers: [AcceptLanguageResolver],
    }),

    // Feature Modules
    CommonModule,
    CoreModule,
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

    // Global filters — AllExceptionsFilter translates structured errors (code + args),
    // validation batches (validationErrors), and registered string keys.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // Global interceptors — registration order is OUTER-to-INNER.
    // TransformInterceptor is last (innermost): it wraps the raw handler response first,
    // then outer interceptors (logging, versioning, compression) see the final shape.
    { provide: APP_INTERCEPTOR, useClass: MessagePackInterceptor },
    { provide: APP_INTERCEPTOR, useClass: StructuredLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ApiVersionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
