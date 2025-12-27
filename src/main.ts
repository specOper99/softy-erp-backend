// IMPORTANT: Import instrument.ts FIRST for Sentry to work correctly
import './instrument';

import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { TransformInterceptor } from './common/interceptors';
import { initTracing } from './common/telemetry/tracing';

// Initialize OpenTelemetry tracing
initTracing();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Global response interceptor
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // CORS
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Chapters Studio ERP API')
    .setDescription(
      'Mini-ERP API for media production house - Manages Bookings, Field Tasks, Finance, and HR/Payroll',
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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
========================================
🎬 Chapters Studio ERP API
========================================
📍 Server:    http://localhost:${port}
📍 API Base:  http://localhost:${port}/api/v1
📍 Swagger:   http://localhost:${port}/api/docs
========================================
  `);
}
void bootstrap();
