import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Analytics Module E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantHost: string;

  beforeAll(async () => {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('Missing required environment variable: SEED_ADMIN_PASSWORD');
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useClass(MockThrottlerGuard)
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

    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantHost = `${seedData.tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: seedData.admin.email,
      password: adminPassword,
    });

    accessToken = loginResponse.body.data?.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Tax Reports', () => {
    describe('GET /api/v1/analytics/tax-report', () => {
      it('should return tax report data', async () => {
        const currentYear = new Date().getFullYear();
        const response = await request(app.getHttpServer())
          .get(`/api/v1/analytics/tax-report?startDate=${currentYear}-01-01&endDate=${currentYear}-12-31`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toHaveProperty('totalTax');
        expect(response.body.data).toHaveProperty('totalSubTotal');
        expect(response.body.data).toHaveProperty('totalGross');
      });

      it('should filter by date range', async () => {
        const currentYear = new Date().getFullYear();
        const response = await request(app.getHttpServer())
          .get(`/api/v1/analytics/tax-report?startDate=${currentYear}-01-01&endDate=${currentYear}-06-30`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeDefined();
      });
    });
  });
});
