process.env.RATE_LIMIT_ENABLED = 'false';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'supertest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MailService } from '../src/modules/mail/mail.service';
import { TenantStatus } from '../src/modules/tenants/enums/tenant-status.enum';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Platform Tenants Lifecycle E2E', () => {
  let app: INestApplication;
  let platformToken: string;
  let createdTenantId: string;
  const testSlug = `e2e-tenant-${Date.now()}`;
  const adminEmail = `admin-${Date.now()}@e2e.example`;
  const reason = 'E2E lifecycle test reason string';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useClass(MockThrottlerGuard)
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

    const login = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .send({
        email: 'admin@erp.soft-y.org',
        password: 'SecurePassword123!',
      })
      .expect(200);

    platformToken = login.body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /platform/tenants creates tenant with required initial admin', () => {
    return request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'E2E Lifecycle Tenant',
        slug: testSlug,
        subscriptionPlan: 'FREE',
        subscriptionStartedAt: '2026-01-01',
        subscriptionEndsAt: '2026-02-01',
        initialAdmin: {
          email: adminEmail,
          password: 'SecurePassword123!',
        },
      })
      .expect(201)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.ACTIVE);
        expect(res.body.data.slug).toBe(testSlug);
        expect(res.body.data.subscriptionStartedAt).toBeDefined();
        createdTenantId = res.body.data.id;
      });
  });

  it('POST /platform/tenants/:id/suspend with grace sets GRACE_PERIOD', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${createdTenantId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason, gracePeriodDays: 7 })
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.GRACE_PERIOD);
      });
  });

  it('POST /platform/tenants/:id/reactivate sets ACTIVE', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${createdTenantId}/reactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason })
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.ACTIVE);
      });
  });

  it('POST /platform/tenants/:id/lock sets LOCKED', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${createdTenantId}/lock?reason=${encodeURIComponent(reason)}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.LOCKED);
      });
  });

  it('DELETE /platform/tenants/:id sets PENDING_DELETION and deletionScheduledAt', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/platform/tenants/${createdTenantId}?reason=${encodeURIComponent(reason)}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.PENDING_DELETION);
        expect(res.body.data.deletionScheduledAt).toBeDefined();
      });
  });

  it('POST /platform/tenants/:id/cancel-deletion restores ACTIVE', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${createdTenantId}/cancel-deletion`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason })
      .expect(200)
      .expect((res: Response) => {
        expect(res.body.data.status).toBe(TenantStatus.ACTIVE);
        expect(res.body.data.deletionScheduledAt).toBeNull();
      });
  });

  it('DELETE with past scheduleFor purges tenant', async () => {
    const purgeSlug = `e2e-purge-${Date.now()}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'E2E Purge Tenant',
        slug: purgeSlug,
        subscriptionPlan: 'FREE',
        initialAdmin: {
          email: `purge-${Date.now()}@e2e.example`,
          password: 'SecurePassword123!',
        },
      })
      .expect(201);

    const purgeTenantId = create.body.data.id as string;
    const pastSchedule = new Date(Date.now() - 60_000).toISOString();

    await request(app.getHttpServer())
      .delete(`/api/v1/platform/tenants/${purgeTenantId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ reason, scheduleFor: pastSchedule })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/platform/tenants/${purgeTenantId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(404);
  });

  it('GET /platform/tenants?status=PENDING_DELETION includes created tenant', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/platform/tenants/${createdTenantId}/lock?reason=${encodeURIComponent(reason)}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200)
      .then(() =>
        request(app.getHttpServer())
          .delete(`/api/v1/platform/tenants/${createdTenantId}?reason=${encodeURIComponent(reason)}`)
          .set('Authorization', `Bearer ${platformToken}`)
          .expect(200),
      )
      .then(() =>
        request(app.getHttpServer())
          .get(`/api/v1/platform/tenants?status=${TenantStatus.PENDING_DELETION}`)
          .set('Authorization', `Bearer ${platformToken}`)
          .expect(200)
          .expect((res: Response) => {
            const tenants = res.body.data.tenants as Array<{ id: string }>;
            expect(tenants.some((t) => t.id === createdTenantId)).toBe(true);
          }),
      );
  });

  it('GET /platform/tenants/:id/timeline returns lifecycle events', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/platform/tenants/${createdTenantId}/timeline`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200)
      .expect((res: Response) => {
        const events = res.body.data as Array<{ eventType: string }>;
        expect(events.length).toBeGreaterThan(0);
        expect(events.some((e) => e.eventType === 'tenant.created')).toBe(true);
        expect(events.some((e) => e.eventType === 'tenant.deletion_scheduled')).toBe(true);
      });
  });
});
