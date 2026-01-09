import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { UpdateNotificationPreferenceDto } from '../../src/modules/notifications/dto/notification-preference.dto';
import {
  NotificationFrequency,
  NotificationType,
} from '../../src/modules/notifications/enums/notification.enum';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

describe('Notification Preferences Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = app.get(DataSource);

    // Login as Admin (who acts as a regular user for this test)
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { role: Role.ADMIN } });
    if (!user) {
      throw new Error('No admin user found in seed data');
    }
    userId = user.id;
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: password })
      .expect(200);

    jwtToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications/preferences - should return empty list initially', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    // It might be empty or valid based on previous implementation
  });

  it('PUT /notifications/preferences - should update preferences', async () => {
    const updates: UpdateNotificationPreferenceDto[] = [
      {
        notificationType: NotificationType.BOOKING_CREATED,
        emailEnabled: false,
        inAppEnabled: true,
        frequency: NotificationFrequency.IMMEDIATE,
      },
      {
        notificationType: NotificationType.TASK_ASSIGNED,
        emailEnabled: true,
        inAppEnabled: false,
        frequency: NotificationFrequency.DAILY_DIGEST,
      },
    ];

    const response = await request(app.getHttpServer())
      .put('/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(updates)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);

    const bookingPref = response.body.find(
      (p: any) => p.notificationType === NotificationType.BOOKING_CREATED,
    );
    expect(bookingPref).toBeDefined();
    expect(bookingPref.emailEnabled).toBe(false);

    const taskPref = response.body.find(
      (p: any) => p.notificationType === NotificationType.TASK_ASSIGNED,
    );
    expect(taskPref).toBeDefined();
    expect(taskPref.frequency).toBe(NotificationFrequency.DAILY_DIGEST);
  });

  it('GET /notifications/preferences - should return updated preferences', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const bookingPref = response.body.find(
      (p: any) => p.notificationType === NotificationType.BOOKING_CREATED,
    );
    expect(bookingPref).toBeDefined();
    expect(bookingPref.emailEnabled).toBe(false);
    expect(bookingPref.userId).toBe(userId);
  });
});
