import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { User } from '../src/modules/users/entities/user.entity';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Auth & Users E2E Tests', () => {
  let app: INestApplication;
  let _accessToken: string;
  let _refreshToken: string;
  let testEmail: string;
  let registeredTenantHost: string;
  let adminTenantHost: string;
  const testPassword = process.env.TEST_MOCK_PASSWORD || 'TestUser123!'; // OK for dynamically created test users

  beforeAll(async () => {
    // Get seeder password from environment variable (after dotenv has loaded)
    // Validate required environment variables (for tests using seeded users)
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.warn('Warning: SEED_ADMIN_PASSWORD not set, using default.');
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
        queueBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        queueTaskAssignment: jest.fn().mockResolvedValue(undefined),
        queuePayrollNotification: jest.fn().mockResolvedValue(undefined),
        queuePasswordReset: jest.fn().mockResolvedValue(undefined),
        queueEmailVerification: jest.fn().mockResolvedValue(undefined),
        queueNewDeviceLogin: jest.fn().mockResolvedValue(undefined),
        queueSuspiciousActivity: jest.fn().mockResolvedValue(undefined),
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

    // Seed and get Tenant ID
    const dataSource = app.get(DataSource);
    const { tenantId, tenantSlug } = await seedTestDatabase(dataSource);
    globalThis.testTenantId = tenantId;
    registeredTenantHost = `${tenantSlug}.example.com`;

    testEmail = `test-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: 'ComplexPass123!',
          companyName: `Test Corp ${Date.now()}`,
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('user');
      _accessToken = response.body.data.accessToken;
      registeredTenantHost = `${response.body.data.user.tenantSlug || response.body.data.user.tenantId}.example.com`;
    });

    it('should fail with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')

        .send({
          email: 'invalid-email',
          password: testPassword,
        })
        .expect(400);
    });

    it('should fail with short password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')

        .send({
          email: 'valid@example.com',
          password: '12345',
        })
        .expect(400);
    });

    it('should fail with duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')

        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', registeredTenantHost)
        .send({
          email: testEmail,
          password: 'ComplexPass123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data).toHaveProperty('accessToken');
      expect(loginRes.body.data).toHaveProperty('refreshToken');
      _accessToken = loginRes.body.data.accessToken;
      _refreshToken = loginRes.body.data.refreshToken;
    });

    it('should fail with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', registeredTenantHost)

        .send({
          email: testEmail,
          password: 'wrongPassword',
        })
        .expect(401);
    });

    it('should fail with non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', registeredTenantHost)

        .send({
          email: 'nonexistent@example.com',
          password: testPassword,
        })
        .expect(401);
    });
  });

  describe('Protected Routes', () => {
    it('should access protected route with admin token', async () => {
      // 1. First register a proper admin user for this test run
      const adminEmail = `admin-${Date.now()}@example.com`;
      const adminPassword = 'AdminPassword123!';
      const adminReg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: adminEmail,
          password: adminPassword,
          companyName: `Admin Corp ${Date.now()}`,
        });

      expect(adminReg.status).toBe(201);
      const adminId = adminReg.body.data.user.id;
      const adminTenantId = adminReg.body.data.user.tenantId;
      adminTenantHost = `${adminReg.body.data.user.tenantSlug || adminTenantId}.example.com`;

      // 2. Manually elevate user to ADMIN role in database
      const userRepo = app.get(getRepositoryToken(User));
      await userRepo.update(adminId, { role: 'ADMIN' });

      // 3. Login as the newly created admin
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', adminTenantHost)
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      expect(adminLogin.status).toBe(200);

      const adminToken = adminLogin.body.data.accessToken;

      await request(app.getHttpServer())
        .get('/api/v1/users')

        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should reject access without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').set('Host', adminTenantHost).expect(401);
    });

    it('should reject access with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', adminTenantHost)

        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('DELETE /api/v1/auth/sessions (revoke other sessions)', () => {
    it('should fail validation when currentRefreshToken missing', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions')
        .set('Host', registeredTenantHost)
        .set('Authorization', `Bearer ${_accessToken}`)
        .send({})
        .expect(400);
    });

    it('should revoke other sessions when currentRefreshToken provided', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions')
        .set('Host', registeredTenantHost)
        .set('Authorization', `Bearer ${_accessToken}`)
        .send({ currentRefreshToken: _refreshToken })
        .expect(204);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should fail when refreshToken missing and allSessions not true', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Host', registeredTenantHost)
        .set('Authorization', `Bearer ${_accessToken}`)
        .send({})
        .expect(400);
    });

    it('should succeed when refreshToken provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Host', registeredTenantHost)
        .set('Authorization', `Bearer ${_accessToken}`)
        .send({ refreshToken: _refreshToken })
        .expect(204);
    });
  });
});
