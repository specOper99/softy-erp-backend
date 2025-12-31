// IMPORTANT: Import instrument.ts FIRST for Sentry to work correctly
import './instrument';

import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { initTracing } from './common/telemetry/tracing';

// Initialize OpenTelemetry tracing
initTracing();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security: Apply Helmet for HTTP security headers
  // Sets: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
  app.use(helmet());

  // Enable graceful shutdown hooks (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  // Global prefix
  app.setGlobalPrefix('api/v1');

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
  const isProd = process.env.NODE_ENV === 'production';

  // Security: Harden CORS in production
  if (isProd && (!corsOrigins || corsOrigins.length === 0 || !corsOrigins[0])) {
    throw new Error(
      'SECURITY: CORS_ORIGINS must be configured in production environments to prevent permissive access.',
    );
  }

  app.enableCors({
    origin: isProd ? corsOrigins : true, // Allow all in development, strictly enforce in production
    credentials: true, // Always allow credentials if origin is matched (standard practice for multi-tenant auth)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
    .addTag('Audit', 'System audit logs')
    .addTag('Metrics', 'System performance metrics')
    .setLicense(
      `Private - ${process.env.COMPANY_NAME || 'Soft-y'}`,
      process.env.COMPANY_URL || 'https://soft-y.com',
    )
    .build();

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  ) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
========================================
🚀 ${process.env.APP_NAME || 'SaaS ERP API'}
========================================
📍 Server:    http://localhost:${port}
📍 API Base:  http://localhost:${port}/api/v1
📍 Swagger:   http://localhost:${port}/api/docs
========================================
  `);
}
void bootstrap();
