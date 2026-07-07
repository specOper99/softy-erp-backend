import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { MailService } from '../src/modules/mail/mail.service';

// Mock ThrottlerGuard
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Tenant Boundary Security E2E', () => {
  let app: INestApplication;

  // Tenant A Data
  const timestamp = Date.now();
  const tenantA = {
    company: `Secure Corp A ${timestamp}`,
    email: `admin-a-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
    slug: '',
  };

  // Tenant B Data
  const tenantB = {
    company: `Secure Corp B ${timestamp}`,
    email: `admin-b-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
    slug: '',
  };

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
        sendMagicLink: jest.fn().mockResolvedValue(undefined),
        queueEmailVerification: jest.fn().mockResolvedValue(undefined),
        queuePasswordReset: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to register and login a tenant
  const registerTenant = async (t: typeof tenantA) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: t.email,
        password: t.password,
        companyName: t.company,
      })
      .expect(201);

    t.token = res.body.data.accessToken;
    t.tenantId = res.body.data.user.tenantId;
    // Calculate slug from company name (same logic as AuthService)
    t.slug = t.company
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/(^-)|(-$)/g, '');
    return t;
  };

  it('Setup: Should register two distinct tenants', async () => {
    await registerTenant(tenantA);
    await registerTenant(tenantB);

    expect(tenantA.tenantId).toBeDefined();
    expect(tenantB.tenantId).toBeDefined();
    expect(tenantA.tenantId).not.toBe(tenantB.tenantId);
  });

  describe('JWT Resource Isolation', () => {
    let pkgA_Id: string;

    it('Tenant A should create a resource', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          name: 'Secret Package A',
          price: 5000,
          description: 'Top Secret A',
        })
        .expect(201);

      pkgA_Id = res.body.data.id;
    });

    it('Tenant B should NOT be able to access Tenant A resource', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/packages/${pkgA_Id}`)
        .set('Authorization', `Bearer ${tenantB.token}`) // Impersonate B accessing A's data
        .expect(404); // Should be 404 (Not Found) as if it doesn't exist for them
    });

    it('Tenant B should NOT be able to update Tenant A resource', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/packages/${pkgA_Id}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ price: 1 })
        .expect(404);
    });
  });
});
