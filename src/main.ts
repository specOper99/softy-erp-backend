// IMPORTANT: Import instrument.ts FIRST for Sentry to work correctly
import './instrument';
import 'reflect-metadata';

import {
  BadRequestException,
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
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

  // Validation pipe with i18n error mapping
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Map every validation error to an i18n translation key and return ALL
      // errors at once so the client can highlight every invalid field in one shot.
      exceptionFactory: (errors) => {
        // Constraint name → i18n key
        const keyMap: Record<string, string> = {
          // Presence
          isNotEmpty: 'validation.required',
          isDefined: 'validation.required',
          isNotEmptyObject: 'validation.required',
          // String
          isString: 'validation.must_be_string',
          // Number
          isNumber: 'validation.must_be_number',
          isInt: 'validation.must_be_integer',
          isPositive: 'validation.must_be_positive',
          isNegative: 'validation.must_be_negative',
          min: 'validation.min_value',
          max: 'validation.max_value',
          // Boolean
          isBoolean: 'validation.must_be_boolean',
          // Date
          isDate: 'validation.must_be_date',
          isDateString: 'validation.must_be_date',
          // Format
          isEmail: 'validation.invalid_email',
          isUrl: 'validation.invalid_url',
          isUUID: 'validation.invalid_uuid',
          isPhoneNumber: 'validation.invalid_phone',
          matches: 'validation.invalid_format',
          // Length
          minLength: 'validation.min_length',
          maxLength: 'validation.max_length',
          length: 'validation.invalid_length',
          // Enum / choice
          isEnum: 'validation.invalid_choice',
          // Array
          isArray: 'validation.must_be_array',
          arrayMinSize: 'validation.array_min_size',
          arrayMaxSize: 'validation.array_max_size',
          arrayNotEmpty: 'validation.required',
          // Object
          isObject: 'validation.must_be_object',
          // Misc
          isOptional: 'validation.invalid',
        };

        const messages = errors.flatMap((error) => {
          if (!error.constraints) return [];
          return Object.entries(error.constraints).map(([constraint]) => {
            const i18nKey = keyMap[constraint] ?? 'validation.invalid';
            return `${error.property}: ${i18nKey}`;
          });
        });

        // Return all field errors so the client can mark every invalid field at once.
        throw new BadRequestException(messages.length > 0 ? messages : 'Validation failed');
      },
    }),
  );

  // Global exception filters are now registered via APP_FILTER in app.module.ts
  // (allows DI injection for I18nService translation)

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'x-client-token', 'Accept-Language'],
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
