import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let tenantHost: string;
  let adminEmail: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
        sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Seed and get Tenant ID
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantHost = `${seedData.tenantId}.example.com`;
    adminEmail = `admin-${seedData.tenantSlug.split('-').pop()}@erp.soft-y.org`;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/auth/login (POST) - should return 401 for invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email: adminEmail, password: 'wrongpassword' })
      .expect(401);
  });

  it('/packages (GET) - should return 401 without auth', () => {
    return request(app.getHttpServer()).get('/api/v1/packages').set('Host', tenantHost).expect(401);
  });
});
