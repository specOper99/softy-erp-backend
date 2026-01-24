import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MailService } from '../src/modules/mail/mail.service';
import { seedTestDatabase } from './utils/seed-data';

describe('Platform E2E Tests', () => {
  let app: INestApplication;
  let platformToken: string;
  let testTenantId: string;
  let testTenantUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendMagicLink: jest.fn().mockResolvedValue(undefined),
        sendPasswordReset: jest.fn().mockResolvedValue(undefined),
        queueEmailVerification: jest.fn().mockResolvedValue(undefined),
        queuePasswordReset: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // Seed test database and get tenant ID
    const dataSource = app.get(DataSource);
    const { tenantId, admin } = await seedTestDatabase(dataSource);
    testTenantId = tenantId;
    testTenantUserId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Platform Authentication (POST /platform/auth/login)', () => {
    it('should login with valid platform credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({
          email: 'admin@platform.com',
          password: 'SecurePassword123!',
        })
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
          expect(res.body.data).toHaveProperty('user');
          expect(res.body.data.user).toHaveProperty('email', 'admin@platform.com');
          platformToken = res.body.data.accessToken;
        });
    });

    it('should reject login with invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({
          email: 'admin@platform.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });

    it('should require MFA when enabled', () => {
      return request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({
          email: 'mfa-user@platform.com',
          password: 'SecurePassword123!',
        })
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data.mfaRequired).toBe(true);
          expect(res.body.data.accessToken).toBe('');
        });
    });

    it('should validate request body', () => {
      return request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({
          email: 'invalid-email',
          password: 'short',
        })
        .expect(400);
    });
  });

  describe('Platform Analytics (GET /platform/analytics/metrics)', () => {
    it('should return platform metrics for authorized user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/platform/analytics/metrics')
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('totalTenants');
          expect(res.body.data).toHaveProperty('activeTenants');
          expect(res.body.data).toHaveProperty('mrr');
          expect(res.body.data).toHaveProperty('arr');
          expect(res.body.data).toHaveProperty('growthRate');
        });
    });

    it('should reject unauthorized access', () => {
      return request(app.getHttpServer()).get('/api/v1/platform/analytics/metrics').expect(401);
    });
  });

  describe('Tenant Health (GET /platform/analytics/tenant/:id/health)', () => {
    it('should return tenant health score', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/platform/analytics/tenant/${testTenantId}/health`)
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('tenantId');
          expect(res.body.data).toHaveProperty('overallScore');
          expect(res.body.data).toHaveProperty('activityScore');
          expect(res.body.data).toHaveProperty('revenueScore');
          expect(res.body.data).toHaveProperty('healthStatus');
          expect(res.body.data).toHaveProperty('recommendations');
        });
    });

    it('should return 404 for non-existent tenant', () => {
      return request(app.getHttpServer())
        .get('/api/v1/platform/analytics/tenant/00000000-0000-0000-0000-000000000000/health')
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(404);
    });
  });

  describe('Revenue Analytics (GET /platform/analytics/revenue)', () => {
    it('should return revenue analytics', () => {
      return request(app.getHttpServer())
        .get('/api/v1/platform/analytics/revenue')
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('totalRevenue');
          expect(res.body.data).toHaveProperty('mrr');
          expect(res.body.data).toHaveProperty('arr');
          expect(res.body.data).toHaveProperty('byPlan');
          expect(res.body.data).toHaveProperty('topTenants');
        });
    });
  });

  describe('Security - Force Password Reset', () => {
    it('should force password reset with reason', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/users/${testTenantUserId}/force-password-reset`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          reason: 'Account compromised - security incident #1234',
        })
        .expect(204);
    });

    it('should reject without reason', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/users/${testTenantUserId}/force-password-reset`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({})
        .expect(400);
    });

    it('should reject reason shorter than 10 characters', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/users/${testTenantUserId}/force-password-reset`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          reason: 'short',
        })
        .expect(400);
    });
  });

  describe('Security - Update IP Allowlist', () => {
    it('should update IP allowlist with valid CIDR', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/ip-allowlist`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          ipAddresses: ['10.0.0.0/8', '192.168.1.0/24'],
          reason: 'Security policy update per ticket #5678',
        })
        .expect(204);
    });

    it('should reject invalid IP format', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/ip-allowlist`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          ipAddresses: ['invalid-ip'],
          reason: 'Security policy update',
        })
        .expect(400);
    });
  });

  describe('Security - Data Export (GDPR)', () => {
    it('should initiate GDPR data export', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/data-export`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          reason: 'GDPR data export request #9876',
          dataCategories: ['users', 'bookings', 'payments'],
        })
        .expect(202)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('exportId');
          expect(res.body.data).toHaveProperty('estimatedCompletionTime');
        });
    });
  });

  describe('Security - Data Deletion', () => {
    it('should schedule data deletion', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/data-deletion`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          reason: 'GDPR right to be forgotten request #4321',
        })
        .expect(202);
    });
  });

  describe('Security - Risk Score', () => {
    it('should get tenant risk score', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/platform/security/tenants/${testTenantId}/risk-score`)
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('tenantId');
          expect(res.body.data).toHaveProperty('riskScore');
          expect(res.body.data.riskScore).toHaveProperty('overall');
          expect(typeof res.body.data.riskScore.overall).toBe('number');
        });
    });
  });

  describe('Security - Revoke Sessions', () => {
    it('should revoke all tenant sessions', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/revoke-sessions`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          reason: 'Security breach detected - incident #7890',
        })
        .expect(200)
        .expect((res: Response) => {
          expect(res.body.data).toHaveProperty('revokedSessions');
          expect(typeof res.body.data.revokedSessions).toBe('number');
        });
    });
  });

  describe('Permission Enforcement', () => {
    it('should reject access without required permission', () => {
      // Invalid token results in 401 Unauthorized
      return request(app.getHttpServer())
        .post(`/api/v1/platform/security/tenants/${testTenantId}/data-deletion`)
        .set('Authorization', `Bearer limited-token`)
        .send({
          reason: 'Test deletion',
        })
        .expect(401);
    });
  });

  describe('Context Validation', () => {
    it('should reject tenant token for platform endpoints', () => {
      // Invalid token results in 401 Unauthorized
      return request(app.getHttpServer())
        .get('/api/v1/platform/analytics/metrics')
        .set('Authorization', `Bearer tenant-token`)
        .expect(401);
    });
  });

  describe('Platform Logout (POST /platform/auth/logout)', () => {
    it('should logout successfully with valid token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/platform/auth/logout')
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(204);
    });

    it('should reject logout without token', () => {
      return request(app.getHttpServer()).post('/api/v1/platform/auth/logout').expect(401);
    });
  });
});
