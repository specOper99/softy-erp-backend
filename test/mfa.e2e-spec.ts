import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { authenticator } from 'otplib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard to always allow requests in tests
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('MFA E2E Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let testEmail: string;
  const testPassword = 'ComplexPass123!';
  let mfaSecret: string;
  let userTenantId: string;

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

    // Seed database (not needed for MFA test, but kept for future use)
    const dataSource = app.get(DataSource);
    await seedTestDatabase(dataSource);

    testEmail = `mfa-test-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Register User', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        companyName: `MFA Corp ${Date.now()}`,
      })
      .expect(201);

    accessToken = response.body.data.accessToken;
    userTenantId = response.body.data.user?.tenantId;
    expect(accessToken).toBeDefined();
    expect(userTenantId).toBeDefined();
  });

  it('2. Generate MFA Secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(response.body.data).toHaveProperty('secret');
    expect(response.body.data).toHaveProperty('qrCodeUrl');
    mfaSecret = response.body.data.secret;
  });

  it('3. Enable MFA', async () => {
    const code = authenticator.generate(mfaSecret);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code })
      .expect(200);
  });

  it('4. Login without MFA code (should return requiresMfa)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    expect(response.body.data.requiresMfa).toBe(true);
    expect(response.body.data.tempToken).toBeDefined();
  });

  it('5. Verify MFA with TOTP code (should succeed)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const code = authenticator.generate(mfaSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-totp')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code,
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('accessToken');
  });

  it('6. Disable MFA', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const code = authenticator.generate(mfaSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-totp')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code,
      })
      .expect(200);

    const newToken = response.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${newToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(200);
  });

  it('7. Login without MFA code (should succeed after disable)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    accessToken = response.body.data.accessToken;
  });

  // Recovery Codes tests
  let recoveryCodes: string[];

  it('8. Re-enable MFA and receive recovery codes', async () => {
    const generateRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(201);

    mfaSecret = generateRes.body.data.secret;

    const code = authenticator.generate(mfaSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .send({ code })
      .expect(200);

    expect(response.body.data).toHaveProperty('codes');
    expect(response.body.data).toHaveProperty('remaining');
    expect(response.body.data.codes).toHaveLength(10);
    expect(response.body.data.remaining).toBe(10);

    recoveryCodes = response.body.data.codes;

    recoveryCodes.forEach((code) => {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    });
  });

  it('9. Login with recovery code (should succeed)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const recoveryCode = recoveryCodes[0];
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code: recoveryCode,
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('accessToken');
    accessToken = response.body.data.accessToken;
  });

  it('10. Reused recovery code should fail', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const recoveryCode = recoveryCodes[0];
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code: recoveryCode,
      })
      .expect(401);
  });

  it('11. Check remaining recovery codes (should be 9)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/mfa/recovery-codes')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(200);

    expect(response.body.data.remaining).toBe(9);
    expect(response.body.data.codes).toEqual([]);
  });

  it('12. Use additional recovery codes to trigger low warning', async () => {
    for (let i = 1; i <= 7; i++) {
      const code = recoveryCodes[i];
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', `${userTenantId}.example.com`)
        .send({
          email: testEmail,
          password: testPassword,
        });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify-recovery')
        .set('Host', `${userTenantId}.example.com`)
        .send({
          tempToken: loginRes.body.data.tempToken,
          code,
        })
        .expect(200);
      accessToken = response.body.data.accessToken;

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/mfa/recovery-codes')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(200);

    expect(response.body.data.remaining).toBe(2);
    expect(response.body.data.warning).toContain('Only 2 recovery codes remaining');
  });

  it('13. Regenerate recovery codes should work', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/recovery-codes/regenerate')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(200);

    expect(response.body.data.codes).toHaveLength(10);
    expect(response.body.data.remaining).toBe(10);

    const newCodes = response.body.data.codes;
    const hasNewCodes = newCodes.some((newCode: string) => !recoveryCodes.includes(newCode));
    expect(hasNewCodes).toBe(true);
  });

  it('14. Old recovery codes should not work after regeneration', async () => {
    const oldCode = recoveryCodes[8];

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code: oldCode,
      });

    expect([400, 401]).toContain(response.status);
  });

  it('14. Invalid recovery code should fail', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-recovery')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code: 'INVALID1',
      });

    expect(response.status).toBe(401);
  });

  it('15. Final login without MFA code (cleanup check)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      });

    const code = authenticator.generate(mfaSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify-totp')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        tempToken: loginRes.body.data.tempToken,
        code,
      })
      .expect(200);

    const newToken = response.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${newToken}`)
      .set('Host', `${userTenantId}.example.com`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', `${userTenantId}.example.com`)
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);
  });
});
