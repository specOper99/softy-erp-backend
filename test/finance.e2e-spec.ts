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

describe('Finance Module E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let createdTransactionId: string;

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

    // Seed database and get tenant
    const dataSource = app.get(DataSource);
    await seedTestDatabase(dataSource);

    // Login as admin
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@chapters.studio',
        password: adminPassword,
      });

    accessToken = loginResponse.body.data?.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============ TRANSACTIONS TESTS ============
  describe('Transactions', () => {
    describe('POST /api/v1/transactions', () => {
      it('should create a transaction (Admin/OpsManager)', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            type: 'INCOME',
            amount: 1000,
            description: 'Test booking payment',
            category: 'BOOKING',
            transactionDate: new Date().toISOString(),
          });

        if (response.status !== 201) {
          console.log('Transaction Creation Failed Debug:', response.body);
        }

        expect(response.status).toBe(201);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.amount).toBe(1000);
        expect(response.body.data.type).toBe('INCOME');
        createdTransactionId = response.body.data.id;
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/transactions')
          .send({
            type: 'EXPENSE',
            amount: 500,
            description: 'Unauthorized transaction',
          })
          .expect(401);
      });

      it('should fail with invalid transaction type', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            type: 'INVALID_TYPE',
            amount: 100,
          })
          .expect(400);
      });
    });

    describe('GET /api/v1/transactions', () => {
      it('should return all transactions', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
      });

      it('should filter transactions by type', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/transactions?type=INCOME')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
        response.body.data.forEach((t: { type: string }) => {
          expect(t.type).toBe('INCOME');
        });
      });
    });

    describe('GET /api/v1/transactions/:id', () => {
      it('should return a specific transaction', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/transactions/${createdTransactionId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.id).toBe(createdTransactionId);
      });

      it('should return 404 for non-existent transaction', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/transactions/ffffffff-ffff-ffff-ffff-ffffffffffff')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });

    describe('GET /api/v1/transactions/summary', () => {
      it('should return financial summary (Admin only)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/transactions/summary')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toHaveProperty('totalIncome');
        expect(response.body.data).toHaveProperty('totalExpenses');
        expect(response.body.data).toHaveProperty('netBalance');
      });
    });
  });

  // ============ WALLETS TESTS ============
  describe('Wallets', () => {
    describe('GET /api/v1/wallets', () => {
      it('should return all employee wallets (Admin)', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/wallets')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer()).get('/api/v1/wallets').expect(401);
      });
    });
  });
});
