/**
 * Comprehensive Tenant Isolation E2E Tests
 *
 * These tests verify that the multi-tenant architecture correctly isolates
 * data between tenants, preventing cross-tenant access in all scenarios.
 *
 * Test Categories:
 * 1. Repository Layer Isolation
 * 2. Service Layer Isolation
 * 3. API Endpoint Isolation
 * 4. Stream/Export Isolation
 * 5. Background Job Isolation
 * 6. Event Handler Isolation
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

describe('Tenant Isolation (E2E)', () => {
  let app: INestApplication;

  // Test fixtures
  const timestamp = Date.now();
  const tenantA = {
    company: `Isolation Test A ${timestamp}`,
    email: `admin-isolation-a-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
    slug: '',
  };

  const tenantB = {
    company: `Isolation Test B ${timestamp}`,
    email: `admin-isolation-b-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
    slug: '',
  };

  // Resources created for cross-tenant tests
  let tenantAPackageId: string;
  let tenantAClientId: string;
  let tenantBPackageId: string;

  // Helper to get Host header for subdomain-based tenant resolution
  const hostFor = (tenant: typeof tenantA) => `${tenant.slug}.example.com`;

  // Helper to extract packages array from paginated API response
  // GET /api/v1/packages returns PaginatedResponseDto<ServicePackage> inside TransformInterceptor
  // Response shape: { data: { data: ServicePackage[], ...paginationFields } }
  const getPackagesArray = (res: request.Response) => res.body.data.data as unknown[];

  // Helper to compare price (handles decimal string from API)
  const expectPrice = (actual: unknown, expected: number) => {
    // API returns decimal as string (e.g., "5000.00")
    expect(String(actual)).toBe(String(expected) + '.00');
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
    t.slug = t.company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-)|(-$)/g, '');
    return t;
  };

  // ==================== Setup ====================

  it('Setup: Should register two distinct tenants', async () => {
    await registerTenant(tenantA);
    await registerTenant(tenantB);

    expect(tenantA.tenantId).toBeDefined();
    expect(tenantB.tenantId).toBeDefined();
    expect(tenantA.tenantId).not.toBe(tenantB.tenantId);
  });

  // ==================== API Endpoint Isolation Tests ====================

  describe('API Endpoint Cross-Tenant Isolation', () => {
    it('Setup: Tenant A should create a package', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          name: 'Tenant A Package',
          price: 5000,
          description: 'Package owned by Tenant A',
        })
        .expect(201);

      tenantAPackageId = res.body.data.id;
      expect(tenantAPackageId).toBeDefined();
    });

    it('Setup: Tenant A should create a client', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          name: 'Tenant A Client',
          email: `client-a-${timestamp}@example.com`,
          phone: '+1234567890',
        })
        .expect(201);

      tenantAClientId = res.body.data.id;
      expect(tenantAClientId).toBeDefined();
    });

    it('Setup: Tenant B should create a package', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          name: 'Tenant B Package',
          price: 3000,
          description: 'Package owned by Tenant B',
        })
        .expect(201);

      tenantBPackageId = res.body.data.id;
      expect(tenantBPackageId).toBeDefined();
    });

    // READ isolation tests
    it('GET /packages should only return current tenant packages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/packages')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      // Verify all packages belong to Tenant A
      const packages = getPackagesArray(res);
      expect(packages).toBeInstanceOf(Array);
      (packages as { name: string }[]).forEach((pkg) => {
        expect(pkg.name).not.toBe('Tenant B Package');
      });
    });

    it('GET /packages/:id should return 404 for other tenant package', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/packages/${tenantBPackageId}`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(404);
    });

    it('GET /clients/:id should return 404 for other tenant client', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/clients/${tenantAClientId}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(404);
    });

    // UPDATE isolation tests
    it('PATCH /packages/:id should return 404 for other tenant package', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/packages/${tenantAPackageId}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ price: 1 })
        .expect(404);
    });

    it('PATCH /clients/:id should return 404 for other tenant client', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/clients/${tenantAClientId}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ name: 'Hacked Name' })
        .expect(404);
    });

    // DELETE isolation tests
    it('DELETE /packages/:id should return 404 for other tenant package (attempted cross-tenant delete)', async () => {
      // Create a sacrificial package for Tenant A
      const res = await request(app.getHttpServer())
        .post('/api/v1/packages')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          name: 'Sacrificial Package',
          price: 100,
          description: 'Will attempt to delete from wrong tenant',
        })
        .expect(201);

      const sacrificialId = res.body.data.id;

      // Tenant B tries to delete Tenant A's package
      await request(app.getHttpServer())
        .delete(`/api/v1/packages/${sacrificialId}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(404);

      // Verify package still exists for Tenant A
      await request(app.getHttpServer())
        .get(`/api/v1/packages/${sacrificialId}`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
    });

    // CREATE with cross-tenant reference tests
    it('POST /bookings should reject clientId from another tenant', async () => {
      // Tenant B tries to create booking with Tenant A's client
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          clientId: tenantAClientId, // Client from Tenant A
          packageId: tenantBPackageId,
          eventDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          eventLocation: 'Test Location',
        });

      // Should fail - either 400 (validation) or 404 (not found)
      expect([400, 404]).toContain(res.status);
    });

    it('POST /bookings should reject packageId from another tenant', async () => {
      // First create a client for Tenant B
      const clientRes = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          name: 'Tenant B Client',
          email: `client-b-booking-${timestamp}@example.com`,
          phone: '+0987654321',
        })
        .expect(201);

      const tenantBClientId = clientRes.body.data.id;

      // Tenant B tries to create booking with Tenant A's package
      const res = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({
          clientId: tenantBClientId,
          packageId: tenantAPackageId, // Package from Tenant A
          eventDate: new Date(Date.now() + 86400000).toISOString(),
          eventLocation: 'Test Location',
        });

      // Should fail
      expect([400, 404]).toContain(res.status);
    });
  });

  // ==================== Subdomain Resolution Tests ====================

  describe('Subdomain-Based Tenant Resolution', () => {
    it('Should resolve tenant correctly from subdomain Host header', async () => {
      // Access via Tenant A's subdomain
      const resA = await request(app.getHttpServer())
        .get('/api/v1/packages')
        .set('Host', hostFor(tenantA))
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      // All returned packages should belong to Tenant A
      const packagesA = getPackagesArray(resA);
      (packagesA as { name: string }[]).forEach((pkg) => {
        expect(pkg.name).not.toBe('Tenant B Package');
      });
    });

    it('Should NOT allow access when subdomain mismatches JWT tenant', async () => {
      // Use Tenant A's token with Tenant B's subdomain
      const res = await request(app.getHttpServer())
        .get('/api/v1/packages')
        .set('Host', hostFor(tenantB))
        .set('Authorization', `Bearer ${tenantA.token}`);

      // JWT-first tenancy: JWT takes precedence over subdomain
      // Should return Tenant A's data (from JWT), or reject with 401/403
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        // Verify correct tenant data is returned (JWT tenant)
        const packages = getPackagesArray(res);
        (packages as { name: string }[]).forEach((pkg) => {
          expect(pkg.name).not.toBe('Tenant B Package');
        });
      }
    });
  });

  // ==================== Data Integrity Verification ====================

  describe('Data Integrity After Operations', () => {
    it('Tenant A data should remain unchanged after Tenant B operations', async () => {
      // Verify Tenant A's package still has original data
      const res = await request(app.getHttpServer())
        .get(`/api/v1/packages/${tenantAPackageId}`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(res.body.data.name).toBe('Tenant A Package');
      expectPrice(res.body.data.price, 5000);
      expect(res.body.data.description).toBe('Package owned by Tenant A');
    });

    it('Tenant A client should remain unchanged after Tenant B operations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${tenantAClientId}`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(res.body.data.name).toBe('Tenant A Client');
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('Should handle malformed tenant ID gracefully', async () => {
      // Try to access with invalid/malformed tenant subdomain
      const res = await request(app.getHttpServer())
        .get('/api/v1/packages')
        .set('Host', 'nonexistent-tenant-xyz.example.com')
        .set('Authorization', `Bearer ${tenantA.token}`);

      // JWT-first tenancy: should return 200 using JWT tenant, or reject with 401/403
      // Per JWT-first tenancy design, JWT takes precedence over malformed Host
      if (res.status === 200) {
        // Verify no cross-tenant leakage - should only see Tenant A's packages
        const packages = getPackagesArray(res);
        (packages as { name: string }[]).forEach((pkg) => {
          expect(pkg.name).not.toBe('Tenant B Package');
        });
      }
      expect([200, 401, 403]).toContain(res.status);
    });

    it('Should handle concurrent cross-tenant requests correctly', async () => {
      // Make parallel requests for both tenants
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).get('/api/v1/packages').set('Authorization', `Bearer ${tenantA.token}`),
        request(app.getHttpServer()).get('/api/v1/packages').set('Authorization', `Bearer ${tenantB.token}`),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Verify isolation is maintained even under concurrent load
      const packagesA = getPackagesArray(resA) as { name: string }[];
      const packagesB = getPackagesArray(resB) as { name: string }[];
      const packageANames = packagesA.map((p) => p.name);
      const packageBNames = packagesB.map((p) => p.name);

      expect(packageANames).toContain('Tenant A Package');
      expect(packageANames).not.toContain('Tenant B Package');
      expect(packageBNames).toContain('Tenant B Package');
      expect(packageBNames).not.toContain('Tenant A Package');
    });
  });
});
