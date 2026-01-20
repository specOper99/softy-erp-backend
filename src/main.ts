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
  // Security headers are now enabled in all environments for testing fidelity.
  // CSP is configured to allow Swagger UI assets in non-production environments.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? undefined // Use default strict CSP in production
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Swagger UI
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https://validator.swagger.io'],
              connectSrc: ["'self'"],
            },
          },
      // HSTS enabled in all environments to ensure test fidelity
      // In non-production, use shorter max-age to avoid long-term caching issues
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : { maxAge: 86400, includeSubDomains: false },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false, // Disabled to allow Swagger UI to load external resources
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Cookie parser for CSRF token handling
  app.use(cookieParser());

  // Enable graceful shutdown hooks (SIGTERM, SIGINT)
  app.enableShutdownHooks();

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
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // CORS - Environment-based configuration
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim());

  // Security: Harden CORS in production
  if (isProd && (!corsOrigins || corsOrigins.length === 0 || !corsOrigins[0])) {
    throw new Error(
      'SECURITY: CORS_ORIGINS must be configured in production environments to prevent permissive access.',
    );
  }

  app.enableCors({
    origin:
      corsOrigins && corsOrigins.length > 0
        ? corsOrigins
        : ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle(process.env.APP_NAME || 'SaaS ERP API')
    .setDescription(
      `API for ${process.env.COMPANY_NAME || 'SaaS Platform'} - Manages Bookings, Field Tasks, Finance, and HR/Payroll.

## API Contexts

This API supports three distinct contexts:

### 🏢 Tenant Context (Business Operations)
Regular business users access tenant-scoped endpoints. JWT tokens have \`audience: "tenant"\`.

### 👑 Platform Context (Superadmin)
Platform administrators access \`/platform/*\` endpoints for SaaS management. JWT tokens have \`audience: "platform"\`. **MFA is mandatory.**

### 🔓 Public Context
Unauthenticated endpoints for registration, login, and public resources.

## Role Hierarchy

| Context | Roles | Access Level |
|---------|-------|--------------|
| Platform | SUPER_ADMIN | Full platform access |
| Platform | SUPPORT_ADMIN | Impersonation, view logs, suspend tenants |
| Platform | BILLING_ADMIN | Subscriptions, refunds, revenue |
| Platform | SECURITY_ADMIN | Lock tenants, force password reset |
| Platform | COMPLIANCE_ADMIN | GDPR export/delete, audit logs |
| Platform | ANALYTICS_VIEWER | Read-only metrics |
| Tenant | ADMIN | Full tenant access |
| Tenant | MANAGER | Operations management |
| Tenant | STAFF | Task execution |
| Tenant | CLIENT | Portal access only |
`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Enter JWT token' },
      'tenant-auth',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Platform Admin JWT (MFA required)' },
      'platform-auth',
    )
    // Public endpoints
    .addTag('Auth', '🔓 Authentication - Login, Register, Password Reset')
    .addTag('Client Portal', '🔓 Client-facing portal with Magic Link auth')
    // Tenant-level endpoints (Business Operations)
    .addTag('Users', '🏢 [Tenant] User management')
    .addTag('Service Packages', '🏢 [Tenant] Catalog - Service packages')
    .addTag('Task Types', '🏢 [Tenant] Catalog - Task type definitions')
    .addTag('Bookings', '🏢 [Tenant] Booking management and workflows')
    .addTag('Tasks', '🏢 [Tenant] Task assignment and completion')
    .addTag('Finance - Transactions', '🏢 [Tenant] Financial transactions')
    .addTag('Finance - Wallets', '🏢 [Tenant] Employee commission wallets')
    .addTag('HR', '🏢 [Tenant] HR and Payroll management')
    .addTag('Dashboard', '🏢 [Tenant] Reporting and analytics dashboard')
    .addTag('Audit', '🏢 [Tenant] System audit logs')
    .addTag('Metrics', '🏢 [Tenant] System performance metrics')
    // Platform-level endpoints (Superadmin)
    .addTag('Platform - Auth', '👑 [Superadmin] Platform authentication (MFA required)')
    .addTag('Platform - Tenants', '👑 [Superadmin] Tenant lifecycle management')
    .addTag('Platform - Support', '👑 [Superadmin] Impersonation and support tools')
    .addTag('Platform - Security', '👑 [Superadmin] Security operations (password reset, session revoke)')
    .addTag('Platform - Analytics', '👑 [Superadmin] Platform-wide metrics and revenue')
    .addTag('Platform - Audit', '👑 [Superadmin] Platform audit logs')
    .addTag('Platform - MFA', '👑 [Superadmin] Multi-factor authentication setup')
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
