import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
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

describe('CRUD Validation E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let tenantHost: string;

  beforeAll(async () => {
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
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    tenantHost = `${seedData.tenantSlug}.example.com`;
    const adminEmail = `admin-${seedData.tenantSlug.split('-').pop()}@erp.soft-y.org`;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'P@ssw0rd123!';

    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Host', tenantHost).send({
      email: adminEmail,
      password: adminPassword,
    });

    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 400 Bad Request on missing required fields, not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'missingname@test.com',
        // missing 'name'
      });

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should return 409 Conflict on duplicate unique fields (email), not 500', async () => {
    // 1. Create a valid client
    const email = `duplicate${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'First User',
        email,
      })
      .expect(201);

    // 2. Try to create another client with the same email
    const res = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Second User',
        email, // duplicate
      });

    expect(res.status).toBe(409);
    expect(res.body.statusCode).toBe(409);
    expect(res.body.code).toBe('database.conflict');
  });
});
