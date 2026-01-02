import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

describe('Tasks Module E2E Tests', () => {
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

    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);

    // Login as admin
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

  describe('GET /api/v1/tasks', () => {
    it('should return all tasks (Admin/OpsManager)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/tasks').expect(401);
    });
  });

  describe('GET /api/v1/tasks/my-tasks', () => {
    it('should return current user tasks', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tasks/my-tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  describe('Task Lifecycle', () => {
    // Note: These tests require existing tasks from seed data
    // or a booking workflow to create tasks first

    it('should handle task operations without errors', async () => {
      // Get all tasks first
      const tasksResponse = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // If there are tasks, test getting one by ID
      if (tasksResponse.body.data?.length > 0) {
        const taskId = tasksResponse.body.data[0].id;

        const response = await request(app.getHttpServer())
          .get(`/api/v1/tasks/${taskId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        // Success: booking and its client should be present if it's a booking task
        if (response.body.data.booking) {
          expect(response.body.data.booking).toHaveProperty('client');
        }
      }
    });

    it('should return 404 for non-existent task', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/tasks/cursor', () => {
    it('should implement cursor-based pagination', async () => {
      const limit = 1;
      // First page
      const response1 = await request(app.getHttpServer())
        .get(`/api/v1/tasks/cursor?limit=${limit}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // TransformInterceptor wraps response in "data", so our object is in response.body.data
      const result1 = response1.body.data;
      expect(result1).toHaveProperty('data');
      expect(result1.data).toBeInstanceOf(Array);
      expect(result1.data.length).toBeLessThanOrEqual(limit);

      if (result1.nextCursor) {
        // Second page
        const response2 = await request(app.getHttpServer())
          .get(
            `/api/v1/tasks/cursor?limit=${limit}&cursor=${result1.nextCursor}`,
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const result2 = response2.body.data;
        expect(result2.data).toBeInstanceOf(Array);
        // Ensure we didn't get the same task again
        if (result1.data.length > 0 && result2.data.length > 0) {
          expect(result1.data[0].id).not.toBe(result2.data[0].id);
        }
      }
    });
  });
});
