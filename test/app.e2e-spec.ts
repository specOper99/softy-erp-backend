import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MailModule } from '../src/modules/mail/mail.module';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

@Module({
  providers: [
    {
      provide: MailService,
      useValue: {
        sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
        sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
      },
    },
  ],
  exports: [MailService],
})
class MockMailModule {}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(MailModule)
      .useModule(MockMailModule)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Seed and get Tenant ID
    const dataSource = app.get(DataSource);
    await seedTestDatabase(dataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('/auth/login (POST) - should return 401 for invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' })
      .expect(401);
  });

  it('/packages (GET) - should return 401 without auth', () => {
    return request(app.getHttpServer()).get('/packages').expect(401);
  });
});
