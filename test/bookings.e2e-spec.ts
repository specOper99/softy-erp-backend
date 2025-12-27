import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Bookings Workflow E2E Tests', () => {
  let app: INestApplication;
  let adminToken: string;
  let packageId: string;
  let bookingId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Login as seeded admin user
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@chapters.studio',
        password: 'Admin123!',
      });
    adminToken = loginResponse.body.accessToken;

    // Get existing package from seed data
    const packagesRes = await request(app.getHttpServer())
      .get('/packages')
      .set('Authorization', `Bearer ${adminToken}`);
    packageId = packagesRes.body[0]?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Booking Workflow', () => {
    it('Step 1: Create Booking (DRAFT)', async () => {
      const response = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientName: 'John Doe',
          clientPhone: '+1234567890',
          clientEmail: 'john@example.com',
          eventDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          packageId,
        })
        .expect(201);

      expect(response.body.status).toBe('DRAFT');
      bookingId = response.body.id;
    });

    it('Step 2: Get Booking Details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.clientName).toBe('John Doe');
    });

    it('Step 3: Confirm Booking (creates tasks + income)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.booking.status).toBe('CONFIRMED');
      expect(response.body.tasksCreated).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('transactionId');
    });

    it('Step 4: Verify Tasks were Created', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const bookingTasks = response.body.filter(
        (t: any) => t.bookingId === bookingId,
      );
      expect(bookingTasks.length).toBeGreaterThan(0);
      expect(bookingTasks[0].status).toBe('PENDING');
    });

    it('Step 5: Verify Income Transaction was Created', async () => {
      const response = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const incomeTransaction = response.body.find(
        (t: any) => t.type === 'INCOME' && t.referenceId === bookingId,
      );
      expect(incomeTransaction).toBeDefined();
    });
  });

  describe('Validation Tests', () => {
    it('should reject booking without required fields', async () => {
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientName: 'John',
          // Missing eventDate and packageId
        })
        .expect(400);
    });

    it('should reject confirming already confirmed booking', async () => {
      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
