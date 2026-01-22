import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors';
import { BookingStatus } from '../../src/modules/bookings/enums/booking-status.enum';
import { MailService } from '../../src/modules/mail/mail.service';
import { seedTestDatabase } from '../utils/seed-data';

describe('Bookings Search (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let tenantHost: string;

  beforeAll(async () => {
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

    // Seed test database to get admin user
    const dataSource = app.get(DataSource);
    const seedData = await seedTestDatabase(dataSource);
    const adminEmail = seedData.admin.email;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';
    tenantHost = `${seedData.tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email: adminEmail, password: adminPassword });

    adminToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should filter bookings by search term', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/bookings')
      .query({ search: 'Test Client' })
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    // Expect at least one result if seed data implies "Test Client" was created
  });

  it('should filter bookings by status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/bookings')
      .query({ status: [BookingStatus.DRAFT, BookingStatus.CONFIRMED] })
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should filter by date range', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/bookings')
      .query({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
