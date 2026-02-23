// IMPORTANT: Import instrument.ts FIRST for Sentry to work correctly
import './instrument';
import 'reflect-metadata';

import { ClassSerializerInterceptor, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { initTracing } from './common/telemetry/tracing';
import { corsOriginDelegate, getCorsOriginAllowlist } from './common/utils/cors-origins.util';
import { configureSwagger } from './config/swagger.config';

// Initialize OpenTelemetry tracing
initTracing();

import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  const isProd = process.env.NODE_ENV === 'production';
  const swaggerEnabled = process.env.ENABLE_SWAGGER === 'true';

  // When behind a reverse proxy (e.g., Kubernetes ingress), enable proxy trust so req.ip is correct.
  // Keep this opt-in to avoid trusting spoofed X-Forwarded-* headers by default.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  configureSwagger(app, { isProd, swaggerEnabled });

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

  const allowlist = getCorsOriginAllowlist({
    raw: process.env.CORS_ORIGINS,
    isProd,
    devFallback: ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5173'],
  });

  app.enableCors({
    origin: corsOriginDelegate(allowlist),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'x-client-token'],
    exposedHeaders: ['Retry-After', 'X-Correlation-ID'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`API Base: http://localhost:${port}/api/v1`);
  if (swaggerEnabled) {
    logger.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}
void bootstrap();
