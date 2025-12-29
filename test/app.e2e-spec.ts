import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

describe('AppController (e2e)', () => {
  let tenantId: string;
  let app: INestApplication;
  beforeEach(async () => {
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
    await app.init();

    // Seed and get Tenant ID
    const dataSource = app.get(DataSource);
    const seedResult = await seedTestDatabase(dataSource);
    tenantId = seedResult.tenantId;
  });

  afterEach(async () => {
    await app.close();
  });

  it('/auth/login (POST) - should return 401 for invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Tenant-ID', tenantId)
      .send({ email: 'test@test.com', password: 'wrong' })
      .expect(401);
  });

  it('/packages (GET) - should return 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/packages')
      .set('X-Tenant-ID', tenantId)
      .expect(401);
  });
});
