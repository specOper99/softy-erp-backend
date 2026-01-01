import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { Profile } from '../src/modules/hr/entities/profile.entity';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('HR Module E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantId: string;
  let createdProfileId: string;
  let testUserId: string;

  beforeAll(async () => {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';

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
    tenantId = seedData.tenantId;

    // Find the profile created for staff in seeder
    const profileRepo = dataSource.getRepository(Profile);
    const staffProfile = await profileRepo.findOne({
      where: { userId: seedData.staff.id },
    });
    createdProfileId = staffProfile?.id as string;
    testUserId = seedData.admin.id;

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

  describe('Employee Profiles', () => {
    describe('POST /api/v1/hr/profiles', () => {
      it('should fail if profile already exists for user (Admin)', async () => {
        // Create a dedicated user for this test to avoid conflicts with seeded data
        const userRepo = app.get(DataSource).getRepository('User');
        const newUser = await userRepo.save({
          email: `profile-test-${Date.now()}@chapters.studio`,
          passwordHash: 'hash',
          role: 'ADMIN',
          isActive: true,
          tenantId,
        });
        const currentTestUserId = newUser.id;

        await request(app.getHttpServer())
          .post('/api/v1/hr/profiles')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            userId: currentTestUserId,
            baseSalary: 7000,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post('/api/v1/hr/profiles')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            userId: currentTestUserId,
            baseSalary: 7000,
          })
          .expect(409);
      });

      it('should fail without authentication', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/hr/profiles')
          .send({
            userId: testUserId,
            baseSalary: 3000,
          })
          .expect(401);
      });
    });

    describe('GET /api/v1/hr/profiles', () => {
      it('should return all profiles', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/hr/profiles')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data).toBeInstanceOf(Array);
      });
    });

    describe('GET /api/v1/hr/profiles/:id', () => {
      it('should return a specific profile', async () => {
        if (!createdProfileId) return;

        const response = await request(app.getHttpServer())
          .get(`/api/v1/hr/profiles/${createdProfileId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.id).toBe(createdProfileId);
      });
    });

    describe('PATCH /api/v1/hr/profiles/:id', () => {
      it('should update a profile', async () => {
        if (!createdProfileId) return;

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/hr/profiles/${createdProfileId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            baseSalary: 6000,
          })
          .expect(200);

        expect(response.body.data.baseSalary).toBe(6000);
      });
    });
  });

  describe('Payroll', () => {
    describe('POST /api/v1/hr/payroll/run', () => {
      it('should run payroll (Admin only)', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/hr/payroll/run')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(201);

        expect(response.body.data).toHaveProperty('totalPayout');
        expect(response.body.data).toHaveProperty('transactionIds');
        expect(Array.isArray(response.body.data.transactionIds)).toBe(true);

        if (response.body.data.transactionIds.length > 0) {
          const txnId = response.body.data.transactionIds[0];
          const txnRes = await request(app.getHttpServer())
            .get(`/api/v1/transactions/${txnId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

          expect(txnRes.body.data.payoutId).toBeDefined();
        }
      });
    });
  });
});
