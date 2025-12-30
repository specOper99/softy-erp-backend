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

describe('Catalog Module E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantId: string;
  let createdPackageId: string;
  let createdTaskTypeId: string;

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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Seed database and get tenant
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantId = seedData.tenantId;

    // Login as admin to get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Tenant-ID', tenantId)
      .send({
        email: 'admin@chapters.studio',
        password: adminPassword || 'ChaptersERP123!',
      });

    accessToken = loginResponse.body.data?.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============ SERVICE PACKAGES TESTS ============
  describe('Service Packages', () => {
    describe('POST /api/v1/packages', () => {
      it('should create a service package (Admin)', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/packages')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Wedding Photography Package',
            description: 'Full day wedding coverage',
            price: 2500,
          });

        if (response.status !== 201) {
          console.log('Package Creation Failed Debug:', {
            name: 'test-document.pdf',
            mimeType: 'application/pdf',
            url: 'http://localhost/test-document.pdf',
            size: 1024,
          });
        }

        expect(response.status).toBe(201);

        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('Wedding Photography Package');
        createdPackageId = response.body.data.id;
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/packages')
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Unauthorized Package',
            price: 100,
          })
          .expect(401);
      });

      it('should fail with invalid data', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/packages')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            // Missing required 'name' field
            price: 'not-a-number',
          })
          .expect(400);
      });
    });

    describe('GET /api/v1/packages', () => {
      it('should return all service packages', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/packages')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
      });
    });

    describe('GET /api/v1/packages/:id', () => {
      it('should return a specific package', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/packages/${createdPackageId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        expect(response.body.data.id).toBe(createdPackageId);
        expect(response.body.data.name).toBe('Wedding Photography Package');
      });

      it('should return 404 for non-existent package', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/packages/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(404);
      });
    });

    describe('PATCH /api/v1/packages/:id', () => {
      it('should update a package', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/packages/${createdPackageId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            price: 3000,
            description: 'Updated full day coverage',
          })
          .expect(200);

        expect(response.body.data.price).toBe(3000);
        expect(response.body.data.description).toBe(
          'Updated full day coverage',
        );
      });
    });

    describe('DELETE /api/v1/packages/:id', () => {
      it('should delete a package (Admin only)', async () => {
        // First create a package to delete
        const createResponse = await request(app.getHttpServer())
          .post('/api/v1/packages')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Package To Delete',
            price: 150,
          });

        const packageIdToDelete = createResponse.body.data.id;

        await request(app.getHttpServer())
          .delete(`/api/v1/packages/${packageIdToDelete}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        // Verify it's deleted
        await request(app.getHttpServer())
          .get(`/api/v1/packages/${packageIdToDelete}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(404);
      });
    });
  });

  // ============ TASK TYPES TESTS ============
  describe('Task Types', () => {
    describe('POST /api/v1/task-types', () => {
      it('should create a task type (Admin)', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/task-types')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Photography',
            description: 'Event photography services',
            defaultCommissionAmount: 150,
          })
          .expect(201);

        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('Photography');
        createdTaskTypeId = response.body.data.id;
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/task-types')
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Unauthorized Task Type',
          })
          .expect(401);
      });
    });

    describe('GET /api/v1/task-types', () => {
      it('should return all task types', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/task-types')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
      });
    });

    describe('GET /api/v1/task-types/:id', () => {
      it('should return a specific task type', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/task-types/${createdTaskTypeId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        expect(response.body.data.id).toBe(createdTaskTypeId);
        expect(response.body.data.name).toBe('Photography');
      });
    });

    describe('PATCH /api/v1/task-types/:id', () => {
      it('should update a task type', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/task-types/${createdTaskTypeId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            description: 'Advanced video editing task',
            defaultCommissionAmount: 200,
          })
          .expect(200);

        expect(response.body.data.description).toBe(
          'Advanced video editing task',
        );
        expect(Number(response.body.data.defaultCommissionAmount)).toBe(200);
      });
    });

    describe('DELETE /api/v1/task-types/:id', () => {
      it('should delete a task type', async () => {
        // Create a task type to delete
        const createResponse = await request(app.getHttpServer())
          .post('/api/v1/task-types')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .send({
            name: 'Task Type To Delete',
            defaultCommissionAmount: 50,
          })
          .expect(201);

        const taskTypeIdToDelete = createResponse.body.data.id;

        await request(app.getHttpServer())
          .delete(`/api/v1/task-types/${taskTypeIdToDelete}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(200);

        // Verify it's deleted
        await request(app.getHttpServer())
          .get(`/api/v1/task-types/${taskTypeIdToDelete}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId)
          .expect(404);
      });
    });
  });
});
