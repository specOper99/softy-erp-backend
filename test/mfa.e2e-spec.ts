import { INestApplication, ValidationPipe } from '@nestjs/common';
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
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    // Seed and get Tenant ID (although we register new user)
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
    expect(accessToken).toBeDefined();
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
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    expect(response.body.data.requiresMfa).toBe(true);
  });

  it('5. Login with MFA code (should succeed)', async () => {
    const code = authenticator.generate(mfaSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
        code,
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('accessToken');
  });

  it('6. Disable MFA', async () => {
    const code = authenticator.generate(mfaSecret);
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: testEmail,
      password: testPassword,
      code,
    });
    const newToken = loginRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);
  });

  it('7. Login without MFA code (should succeed after disable)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    accessToken = response.body.data.accessToken;
  });

  describe('Recovery Codes', () => {
    let recoveryCodes: string[];

    it('8. Re-enable MFA and receive recovery codes', async () => {
      // First generate MFA secret again
      const generateRes = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/generate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      mfaSecret = generateRes.body.data.secret;

      // Enable MFA with TOTP code
      const code = authenticator.generate(mfaSecret);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code })
        .expect(200);

      // Should receive recovery codes
      expect(response.body.data).toHaveProperty('codes');
      expect(response.body.data).toHaveProperty('remaining');
      expect(response.body.data.codes).toHaveLength(10);
      expect(response.body.data.remaining).toBe(10);

      recoveryCodes = response.body.data.codes;

      // Verify all codes are 8-character uppercase hex strings
      recoveryCodes.forEach((code) => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });
    });

    it('9. Login with recovery code (should succeed)', async () => {
      const recoveryCode = recoveryCodes[0];
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
          code: recoveryCode,
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      accessToken = response.body.data.accessToken;
    });

    it('10. Reused recovery code should fail', async () => {
      const recoveryCode = recoveryCodes[0]; // Same code as before
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
          code: recoveryCode,
        })
        .expect(401);
    });

    it('11. Check remaining recovery codes (should be 9)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/mfa/recovery-codes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.remaining).toBe(9);
      expect(response.body.data.codes).toEqual([]); // Should not return actual codes
    });

    it('12. Use additional recovery codes to trigger low warning', async () => {
      // Use recovery codes until only 2 remain
      for (let i = 1; i <= 7; i++) {
        const code = recoveryCodes[i];
        const loginRes = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: testEmail,
            password: testPassword,
            code,
          })
          .expect(200);
        accessToken = loginRes.body.data.accessToken;

        // Small delay to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Check status - should have warning
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/mfa/recovery-codes')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.remaining).toBe(2);
      expect(response.body.data.warning).toContain('Only 2 recovery codes remaining');
    });

    it('13. Regenerate recovery codes should work', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/recovery-codes/regenerate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.codes).toHaveLength(10);
      expect(response.body.data.remaining).toBe(10);

      // Verify new codes are different from old ones
      const newCodes = response.body.data.codes;
      const hasNewCodes = newCodes.some((newCode: string) => !recoveryCodes.includes(newCode));
      expect(hasNewCodes).toBe(true);
    });

    it('14. Old recovery codes should not work after regeneration', async () => {
      const oldCode = recoveryCodes[8]; // An unused code from the original set

      // Should fail because code is invalid or too short (validation error = 400)
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testEmail,
        password: testPassword,
        code: oldCode,
      });

      // Accept either 400 (validation) or 401 (invalid code)
      expect([400, 401]).toContain(response.status);
    });

    it('14. Invalid recovery code should fail', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testEmail,
        password: testPassword,
        code: 'INVALID1',
      });

      // Should be 401 because code is incorrect (but valid length)
      expect(response.status).toBe(401);
    });
  });

  it('15. Final login without MFA code (cleanup check)', async () => {
    // Disable MFA for cleanup
    const code = authenticator.generate(mfaSecret);
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: testEmail,
      password: testPassword,
      code,
    });
    const newToken = loginRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    // Verify can login without MFA
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);
  });
});
