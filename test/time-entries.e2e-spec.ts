import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { unwrapListData } from './utils/e2e-response';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Time Entries E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let createdTaskId: string;
  let activeTimerId: string;
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

    // Seed database
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantHost = `${seedData.tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: seedData.admin.email,
      password: adminPassword,
    });

    accessToken = loginResponse.body.data?.accessToken;
    // Get package ID from seed data
    const packagesRes = await request(app.getHttpServer())
      .get('/api/v1/packages')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`);
    const packageId = unwrapListData<{ id: string }>(packagesRes.body)[0]?.id;

    // Create client for booking
    const clientRes = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Timer Test Client',
        email: `timer-test-${Date.now()}@example.com`,
        phone: '+1234567890',
      });
    const clientId = clientRes.body.data?.id;

    if (packageId && clientId) {
      // Create booking
      const bookingRes = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId,
          eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          packageId,
        });
      const bookingId = bookingRes.body.data?.id;

      if (bookingId) {
        // Confirm booking to create tasks
        await request(app.getHttpServer())
          .patch(`/api/v1/bookings/${bookingId}/confirm`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`);

        // Get the first task from this booking
        const tasksRes = await request(app.getHttpServer())
          .get('/api/v1/tasks')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`);

        const bookingTasks = unwrapListData<{ bookingId: string; id: string }>(tasksRes.body).filter(
          (t) => t.bookingId === bookingId,
        );
        if (bookingTasks?.length > 0) {
          createdTaskId = bookingTasks[0].id;
        }
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Timer Flow', () => {
    describe('POST /api/v1/tasks/time-entries/start', () => {
      it('should start a new timer', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/tasks/time-entries/start')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            taskId: createdTaskId,
            billable: true,
            notes: 'Starting work on E2E test task',
          })
          .expect(201);

        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.status).toBe('RUNNING');
        activeTimerId = response.body.data.id;
      });

      it('should fail when starting timer with active one', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/tasks/time-entries/start')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            taskId: createdTaskId,
          })
          .expect(400);
      });
    });

    describe('GET /api/v1/tasks/time-entries/active', () => {
      it('should return active timer', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/tasks/time-entries/active')
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.status).toBe('RUNNING');
      });
    });

    describe('POST /api/v1/tasks/time-entries/:id/stop', () => {
      it('should stop active timer', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/tasks/time-entries/${activeTimerId}/stop`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            notes: 'Finished work',
          })
          .expect(201);

        expect(response.body.data.status).toBe('STOPPED');
        expect(response.body.data.durationMinutes).toBeDefined();
      });

      it('should fail stopping already stopped timer', async () => {
        await request(app.getHttpServer())
          .post(`/api/v1/tasks/time-entries/${activeTimerId}/stop`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(400);
      });
    });

    describe('GET /api/v1/tasks/time-entries/task/:taskId', () => {
      it('should return time entries for task', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/time-entries/task/${createdTaskId}`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Time Entry Management', () => {
    describe('PATCH /api/v1/tasks/time-entries/:id', () => {
      it('should update time entry notes', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/tasks/time-entries/${activeTimerId}`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            notes: 'Updated notes for E2E test',
            billable: false,
          })
          .expect(200);

        expect(response.body.data.notes).toBe('Updated notes for E2E test');
        expect(response.body.data.billable).toBe(false);
      });
    });

    describe('DELETE /api/v1/tasks/time-entries/:id', () => {
      it('should delete time entry', async () => {
        await request(app.getHttpServer())
          .delete(`/api/v1/tasks/time-entries/${activeTimerId}`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      });

      it('should return 404 for deleted entry', async () => {
        await request(app.getHttpServer())
          .get(`/api/v1/tasks/time-entries/${activeTimerId}`)
          .set('Host', tenantHost)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
      });
    });
  });
});
