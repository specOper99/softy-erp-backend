// IMPORTANT: Import instrument.ts FIRST for Sentry to work correctly
import './instrument';

import { ClassSerializerInterceptor, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { initTracing } from './common/telemetry/tracing';

// Initialize OpenTelemetry tracing
initTracing();

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  // When behind a reverse proxy (e.g., Kubernetes ingress), enable proxy trust so req.ip is correct.
  // Keep this opt-in to avoid trusting spoofed X-Forwarded-* headers by default.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Security: Apply Helmet for HTTP security headers.
  // In local dev (HTTP), avoid forcing HTTPS upgrades via CSP/HSTS; Safari will otherwise
  // attempt to load Swagger UI assets over HTTPS and fail with TLS errors.
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      hsts: isProd ? undefined : false,
      crossOriginResourcePolicy: isProd ? undefined : false,
    }),
  );

  // Cookie parser for CSRF token handling
  app.use(cookieParser());

  // Enable graceful shutdown hooks (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  // Global prefix
  // Global prefix
  app.setGlobalPrefix('api');

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors (sanitize inputs, transform outputs)
  app.useGlobalInterceptors(
    // SanitizeInterceptor removed in favor of  TransformInterceptor,(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // CORS - Environment-based configuration
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim());

  // Security: Harden CORS in production
  if (isProd && (!corsOrigins || corsOrigins.length === 0 || !corsOrigins[0])) {
    throw new Error(
      'SECURITY: CORS_ORIGINS must be configured in production environments to prevent permissive access.',
    );
  }

  app.enableCors({
    origin: isProd ? corsOrigins : ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle(process.env.APP_NAME || 'SaaS ERP API')
    .setDescription(
      `API for ${process.env.COMPANY_NAME || 'SaaS Platform'} - Manages Bookings, Field Tasks, Finance, and HR/Payroll`,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Service Packages', 'Catalog - Service packages')
    .addTag('Task Types', 'Catalog - Task type definitions')
    .addTag('Bookings', 'Booking management and workflows')
    .addTag('Tasks', 'Task assignment and completion')
    .addTag('Finance - Transactions', 'Financial transactions')
    .addTag('Finance - Wallets', 'Employee commission wallets')
    .addTag('HR', 'HR and Payroll management')
    .addTag('Dashboard', 'Reporting and analytics dashboard')
    .addTag('Client Portal', 'Client-facing portal and magic link auth')
    .addTag('Audit', 'System audit logs')
    .addTag('Metrics', 'System performance metrics')
    .setLicense(`Private - ${process.env.COMPANY_NAME || 'Soft-y'}`, process.env.COMPANY_URL || 'https://soft-y.com')
    .build();

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`API Base: http://localhost:${port}/api/v1`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    logger.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}
void bootstrap();
