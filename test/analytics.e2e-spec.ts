import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
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

    // Seed database and login
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

  describe('Revenue Reports', () => {
    describe('GET /api/v1/analytics/revenue-by-package', () => {
      it('should return revenue by package data', async () => {
        const currentYear = new Date().getFullYear();
        const response = await request(app.getHttpServer())
          .get(`/api/v1/analytics/revenue-by-package?startDate=${currentYear}-01-01&endDate=${currentYear}-12-31`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
      });

      it('should fail without date filters', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/analytics/revenue-by-package')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(400);
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/analytics/revenue-by-package')
          .set('Host', tenantHost)
          .expect(401);
      });
    });
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

    describe('GET /api/v1/analytics/revenue-by-package/pdf', () => {
      it('should return PDF file', async () => {
        const currentYear = new Date().getFullYear();
        const response = await request(app.getHttpServer())
          .get(`/api/v1/analytics/revenue-by-package/pdf?startDate=${currentYear}-01-01&endDate=${currentYear}-12-31`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.headers['content-type']).toContain('application/pdf');
      });
    });
  });

  describe('Caching', () => {
    it('should return cached data on subsequent requests', async () => {
      const currentYear = new Date().getFullYear();
      const url = `/api/v1/analytics/revenue-by-package?startDate=${currentYear}-01-01&endDate=${currentYear}-12-31`;

      // First request
      const firstResponse = await request(app.getHttpServer())
        .get(url)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Second request (should be cached)
      const secondResponse = await request(app.getHttpServer())
        .get(url)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Both should return the same data structure
      expect(firstResponse.body.data).toEqual(secondResponse.body.data);
    });
  });
});
