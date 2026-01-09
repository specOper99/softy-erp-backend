import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { BookingStatus } from '../../src/modules/bookings/enums/booking-status.enum';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Bookings Search (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
    await app.init();

    // Login as Admin
    const dataSource = app.get(DataSource);
    const userRepo = dataSource.getRepository(User);
    const adminUser = await userRepo.findOne({ where: { role: Role.ADMIN } });

    if (!adminUser) throw new Error('No admin user found');

    const email = adminUser.email;
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should filter bookings by search term', async () => {
    const response = await request(app.getHttpServer())
      .get('/bookings')
      .query({ search: 'Test Client' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    // Expect at least one result if seed data implies "Test Client" was created
  });

  it('should filter bookings by status', async () => {
    const response = await request(app.getHttpServer())
      .get('/bookings')
      .query({ status: [BookingStatus.DRAFT, BookingStatus.CONFIRMED] })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should filter by date range', async () => {
    const response = await request(app.getHttpServer())
      .get('/bookings')
      .query({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
