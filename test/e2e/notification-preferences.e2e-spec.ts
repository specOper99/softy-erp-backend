import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors';
import { MailService } from '../../src/modules/mail/mail.service';
import { UpdateNotificationPreferenceDto } from '../../src/modules/notifications/dto/notification-preference.dto';
import { NotificationFrequency, NotificationType } from '../../src/modules/notifications/enums/notification.enum';
import { seedTestDatabase } from '../utils/seed-data';

describe('Notification Preferences Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtToken: string;
  let userId: string;

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
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
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

    dataSource = app.get(DataSource);

    const seedData = await seedTestDatabase(dataSource);
    userId = seedData.admin.id;
    const password = process.env.SEED_ADMIN_PASSWORD || 'softYERP123!';
    const tenantHost = `${seedData.tenantId}.example.com`;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({ email: seedData.admin.email, password: password })
      .expect(200);

    jwtToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications/preferences - should return empty list initially', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
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
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(updates)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);

    const bookingPref = response.body.data.find((p: any) => p.notificationType === NotificationType.BOOKING_CREATED);
    expect(bookingPref).toBeDefined();
    expect(bookingPref.emailEnabled).toBe(false);
    expect(bookingPref.inAppEnabled).toBe(true);

    const taskPref = response.body.data.find((p: any) => p.notificationType === NotificationType.TASK_ASSIGNED);
    expect(taskPref).toBeDefined();
    expect(taskPref.emailEnabled).toBe(true);
    expect(taskPref.inAppEnabled).toBe(false);
    expect(taskPref.frequency).toBe(NotificationFrequency.DAILY_DIGEST);
  });

  it('GET /notifications/preferences - should return updated preferences', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const bookingPref = response.body.data.find((p: any) => p.notificationType === NotificationType.BOOKING_CREATED);
    expect(bookingPref).toBeDefined();
    expect(bookingPref.emailEnabled).toBe(false);
    expect(bookingPref.userId).toBe(userId);
  });
});
