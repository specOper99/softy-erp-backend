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

describe('Audit Log E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error(
        'Missing required environment variable: SEED_ADMIN_PASSWORD',
      );
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

    // Seed database
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: seedData.admin.email,
        password: adminPassword,
      });

    accessToken = loginResponse.body.data?.accessToken;

    // Create some entities to generate audit logs
    await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Audit Test Client',
        email: `audit.test.${Date.now()}@example.com`,
        phone: '+1234567890',
      });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Audit Log Retrieval', () => {
    describe('GET /api/v1/audit', () => {
      it('should return paginated audit logs', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/audit?limit=10')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toHaveProperty('data');
        expect(response.body.data.data).toBeInstanceOf(Array);
      });

      it('should support cursor pagination', async () => {
        // First request
        const firstResponse = await request(app.getHttpServer())
          .get('/api/v1/audit?limit=5')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const nextCursor = firstResponse.body.data?.nextCursor;

        if (nextCursor) {
          // Second request with cursor
          const secondResponse = await request(app.getHttpServer())
            .get(`/api/v1/audit?limit=5&cursor=${nextCursor}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

          // Should return different records
          if (secondResponse.body.data.data.length > 0) {
            expect(secondResponse.body.data.data[0].id).not.toBe(
              firstResponse.body.data.data[0].id,
            );
          }
        }
      });

      it('should filter by entity name', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/audit?entityName=Client')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        response.body.data.data.forEach((log: { entityName: string }) => {
          expect(log.entityName).toBe('Client');
        });
      });

      it('should filter by action', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/audit?action=CREATE')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        response.body.data.data.forEach((log: { action: string }) => {
          expect(log.action).toBe('CREATE');
        });
      });

      it('should filter by date range', async () => {
        const today = new Date().toISOString().split('T')[0];
        const response = await request(app.getHttpServer())
          .get(`/api/v1/audit?startDate=${today}&endDate=${today}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.data).toBeInstanceOf(Array);
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer()).get('/api/v1/audit').expect(401);
      });
    });

    describe('GET /api/v1/audit/:id', () => {
      it('should return specific audit log', async () => {
        // First get some logs
        const listResponse = await request(app.getHttpServer())
          .get('/api/v1/audit?limit=1')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const logId = listResponse.body.data.data[0]?.id;

        if (logId) {
          const response = await request(app.getHttpServer())
            .get(`/api/v1/audit/${logId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

          expect(response.body.data.id).toBe(logId);
        }
      });

      it('should return 404 for non-existent log', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/audit/ffffffff-ffff-ffff-ffff-ffffffffffff')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });
  });
});
