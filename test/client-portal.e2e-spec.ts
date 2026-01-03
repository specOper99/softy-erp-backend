import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { Client } from '../src/modules/bookings/entities/client.entity';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

describe('Client Portal (e2e)', () => {
  let app: INestApplication;
  let clientRepository: Repository<Client>;
  let testClient: Client;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
        sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
        sendMagicLink: jest.fn().mockResolvedValue({ success: true }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
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
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const dataSource = moduleFixture.get<DataSource>(DataSource);
    clientRepository = dataSource.getRepository(Client);

    // Seed Test DB and Get Tenant ID
    const seedData = await seedTestDatabase(dataSource);

    // Create a test client for portal tests
    testClient = await clientRepository.save({
      name: 'Portal Test Client',
      email: `portal.test.${Date.now()}@example.com`,
      phone: '+1234567890',
      tenantId: seedData.tenantId,
    });
  });

  afterAll(async () => {
    // Cleanup test client
    if (testClient?.id) {
      await clientRepository.delete(testClient.id);
    }
    await app?.close();
  });

  describe('Magic Link Authentication', () => {
    it('POST /client-portal/auth/request-magic-link should accept valid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/request-magic-link')
        .send({ email: testClient.email })
        .expect(201);

      // Response is wrapped in { data: { message: ... } } by TransformInterceptor
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('magic link');
    });

    it('POST /client-portal/auth/request-magic-link should not reveal non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/request-magic-link')
        .send({ email: 'nonexistent@example.com' })
        .expect(201);

      // Same message for security (doesn't reveal if email exists)
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('magic link');
    });

    it('POST /client-portal/auth/verify should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .send({ token: 'invalid-token' })
        .expect(404);
    });
  });

  describe('Protected Endpoints', () => {
    it('GET /client-portal/bookings should require token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/client-portal/bookings')
        .expect(401);
    });

    it('GET /client-portal/profile should require token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/client-portal/profile')
        .expect(401);
    });
  });

  describe('Authenticated Access', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Set up a valid token directly in the database for testing
      const token = 'test-e2e-token-' + Date.now();
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 24);

      await clientRepository.update(testClient.id, {
        accessToken: token,
        accessTokenExpiry: expiry,
      });

      accessToken = token;
    });

    it('GET /client-portal/bookings should return bookings with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/client-portal/bookings')
        .set('x-client-token', accessToken)
        .expect(200);

      // Response is wrapped in { data: [...] } by TransformInterceptor
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /client-portal/profile should return client profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/client-portal/profile')
        .set('x-client-token', accessToken)
        .expect(200);

      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('name');
    });

    it('POST /client-portal/auth/logout should invalidate token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/logout')
        .set('x-client-token', accessToken)
        .expect(201);

      // Token should now be invalid
      await request(app.getHttpServer())
        .get('/api/v1/client-portal/bookings')
        .set('x-client-token', accessToken)
        .expect(401);
    });
  });
});
