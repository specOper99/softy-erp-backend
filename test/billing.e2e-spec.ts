import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { StripeService } from '../src/modules/billing/services/stripe.service';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

// Mock Stripe service for E2E tests
const mockStripeService = {
  isConfigured: jest.fn().mockReturnValue(true),
  getClient: jest.fn().mockReturnValue({}),
  createCustomer: jest.fn().mockResolvedValue({
    id: 'cus_test123',
    email: 'test@example.com',
    name: 'Test Customer',
  }),
  listProducts: jest.fn().mockResolvedValue({
    data: [
      { id: 'prod_test1', name: 'Basic Plan', active: true },
      { id: 'prod_test2', name: 'Pro Plan', active: true },
    ],
  }),
  listPrices: jest.fn().mockResolvedValue({
    data: [
      {
        id: 'price_test1',
        unit_amount: 2900,
        currency: 'usd',
        product: 'prod_test1',
      },
      {
        id: 'price_test2',
        unit_amount: 9900,
        currency: 'usd',
        product: 'prod_test2',
      },
    ],
  }),
  listInvoices: jest.fn().mockResolvedValue({
    data: [
      { id: 'in_test1', amount_due: 2900, status: 'paid', created: 1704067200 },
    ],
  }),
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test_session',
    url: 'https://checkout.stripe.com/test',
  }),
  createBillingPortalSession: jest.fn().mockResolvedValue({
    id: 'bps_test_session',
    url: 'https://billing.stripe.com/test',
  }),
};

describe('Billing Module E2E Tests', () => {
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
      .overrideProvider(StripeService)
      .useValue(mockStripeService)
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

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: seedData.admin.email,
        password: adminPassword,
      });

    accessToken = loginResponse.body.data?.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Billing Products & Prices', () => {
    describe('GET /api/v1/billing/products', () => {
      it('should return list of products', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/billing/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.data).toBeInstanceOf(Array);
        expect(response.body.data.data.length).toBeGreaterThan(0);
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/billing/products')
          .expect(401);
      });
    });

    describe('GET /api/v1/billing/prices', () => {
      it('should return list of prices', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/billing/prices')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.data).toBeInstanceOf(Array);
      });
    });
  });

  describe('Billing Invoices', () => {
    describe('GET /api/v1/billing/invoices', () => {
      it('should return list of invoices', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/billing/invoices')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.data).toBeInstanceOf(Array);
      });
    });
  });

  describe('Checkout & Portal Sessions', () => {
    describe('POST /api/v1/billing/checkout-session', () => {
      it('should create checkout session', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/billing/checkout-session')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            priceId: 'price_test1',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          })
          .expect(201);

        expect(response.body.data).toHaveProperty('url');
      });
    });

    describe('POST /api/v1/billing/portal-session', () => {
      it('should create portal session', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/billing/portal-session')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            returnUrl: 'https://example.com/dashboard',
          })
          .expect(201);

        expect(response.body.data).toHaveProperty('url');
      });
    });
  });

  describe('Subscription Management', () => {
    describe('GET /api/v1/billing/subscription', () => {
      it('should return subscription status', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/billing/subscription')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('data');
      });
    });
  });
});
