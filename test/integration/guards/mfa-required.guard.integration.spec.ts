import type { INestApplication } from '@nestjs/common';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../src/app.module';
import { IpRateLimitGuard } from '../../../src/common/guards/ip-rate-limit.guard';
import { TransformInterceptor } from '../../../src/common/interceptors';
import { MailService } from '../../../src/modules/mail/application/mail.service';
import { Role } from '../../../src/modules/users/domain/enums/role.enum';
import { seedTestDatabase } from '../../utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('MfaRequiredGuard integration', () => {
  let app: INestApplication;
  let accessToken: string;
  let userTenantId: string;
  const testEmail = `mfa-guard-${Date.now()}@example.com`;
  const testPassword = 'ComplexPass123!';
  const originalRateLimitEnabled = process.env.RATE_LIMIT_ENABLED;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useClass(MockThrottlerGuard)
      .overrideGuard(IpRateLimitGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    const dataSource = app.get(DataSource);
    await seedTestDatabase(dataSource);

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        companyName: `MFA Guard Corp ${Date.now()}`,
      })
      .expect(201);

    accessToken = registerRes.body.data.accessToken;
    userTenantId = registerRes.body.data.user?.tenantId;
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = originalRateLimitEnabled;
    await app.close();
  });

  it('returns 403 auth.mfa_required_enable on @MfaRequired route when ADMIN has isMfaEnabled=false', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: `new-user-${Date.now()}@example.com`,
        password: testPassword,
        role: Role.FIELD_STAFF,
      })
      .expect(403);

    expect(response.body.code).toBe('auth.mfa_required_enable');
  });
});
