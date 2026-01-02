import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

describe('Bookings Workflow E2E Tests', () => {
  let app: INestApplication;
  let adminToken: string;
  let packageId: string;
  let clientId: string;
  let bookingId: string;

  beforeAll(async () => {
    // Get password from environment variable (after dotenv has loaded)
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;

    // Validate required environment variable
    if (!adminPassword) {
      throw new Error(
        'Missing required environment variable: SEED_ADMIN_PASSWORD',
      );
    }

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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Seed Test DB and Get Tenant ID
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    const tenantId = seedData.tenantId;

    // Login as seeded admin user
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: seedData.admin.email,
        password: adminPassword,
      });
    adminToken = loginResponse.body.data.accessToken;

    // Get existing package from seed data
    const packagesRes = await request(app.getHttpServer())
      .get('/api/v1/packages')
      .set('Authorization', `Bearer ${adminToken}`);
    packageId = packagesRes.body.data[0]?.id;

    // Store tenantId for tests
    (global as any).testTenantId = tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Booking Workflow', () => {
    it('Step 0: Create Client', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
        })
        .expect(201);

      clientId = response.body.data.id;
      expect(clientId).toBeDefined();
    });

    it('Step 1: Create Booking (DRAFT)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          eventDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          packageId,
        })
        .expect(201);

      expect(response.body.data.status).toBe('DRAFT');
      expect(response.body.data.clientId).toBe(clientId);
      bookingId = response.body.data.id;
    });

    it('Step 2: Get Booking Details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.clientId).toBe(clientId);
      expect(response.body.data.client.name).toBe('John Doe');
    });

    it('Step 3: Confirm Booking (creates tasks + income)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.booking.status).toBe('CONFIRMED');
      console.log(
        'E2E DEBUG: Confirm response:',
        JSON.stringify(response.body.data, null, 2),
      );
      expect(response.body.data.tasksCreated).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty('transactionId');
    });

    it('Step 4: Verify Tasks were Created', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const tasks = response.body.data || response.body;
      const bookingTasks = tasks.filter((t: any) => t.bookingId === bookingId);
      expect(bookingTasks.length).toBeGreaterThan(0);
      expect(bookingTasks[0].status).toBe('PENDING');
    });

    it('Step 5: Verify Income Transaction was Created', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const transactions = response.body.data || response.body;
      console.log(
        'E2E DEBUG: All transactions:',
        JSON.stringify(transactions, null, 2),
      );
      const incomeTransaction = transactions.find(
        (t: any) => t.type === 'INCOME' && t.bookingId === bookingId,
      );
      console.log('E2E DEBUG: Looking for bookingId:', bookingId);
      expect(incomeTransaction).toBeDefined();
    });
  });

  describe('Validation Tests', () => {
    it('should reject booking without required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientId,
          // Missing eventDate and packageId
        })
        .expect(400);
    });

    it('should reject confirming already confirmed booking', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)

        .expect(400);
    });
  });
});
