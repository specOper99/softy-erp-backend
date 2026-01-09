import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { Client } from '../src/modules/bookings/entities/client.entity';
import { MailService } from '../src/modules/mail/mail.service';

// Mock ThrottlerGuard
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Tenant Boundary Security E2E', () => {
  let app: INestApplication;
  let clientRepository: Repository<Client>;
  let mailService: MailService;

  // Tenant A Data
  const timestamp = Date.now();
  const tenantA = {
    company: `Secure Corp A ${timestamp}`,
    email: `admin-a-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
  };

  // Tenant B Data
  const tenantB = {
    company: `Secure Corp B ${timestamp}`,
    email: `admin-b-${timestamp}@example.com`,
    password: 'Password123!',
    token: '',
    tenantId: '',
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

    // Get repositories directly for verification setup
    clientRepository = moduleFixture.get(getRepositoryToken(Client));
    mailService = moduleFixture.get(MailService);
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

  describe('Magic Link Security & Isolation', () => {
    let clientA: Client;
    let magicLinkToken: string;

    it('Should create a client for Tenant A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          name: 'Client A',
          email: `client-a-${timestamp}@example.com`,
          phone: '+1234567890',
        })
        .expect(201);

      // Wait for DB to settle (optional but safe)
      const savedClient = await clientRepository.findOne({
        where: { id: res.body.data.id },
      });
      expect(savedClient).toBeDefined();
      if (savedClient) clientA = savedClient;
    });

    it('Should generate magic link using public endpoint (Tenant A context)', async () => {
      // We need to request the magic link via the controller to trigger the full flow
      // The controller uses the domain to determine tenant, or header.
      // In our current implementation, requestMagicLink finds the client by email.
      // If emails are unique globally, it finds the right one.
      // If emails are per-tenant, we might have issues if we don't send X-Tenant-ID header (if supported) or domain.
      // Let's assume email lookup works for now.

      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/request-magic-link')
        .set('X-Tenant-ID', clientA.tenantId)
        .send({ email: clientA.email })
        .expect(201);

      // Fetch the token directly from DB for testing (since we mocked MailService)
      // In real world, user clicks link in email.
      // We need the raw token. But wait! The service hashes it now!
      // We cannot get the raw token from DB anymore.
      // We must spy on the MailService to get the token it was called with.

      expect(mailService.sendMagicLink).toHaveBeenCalled();
      const callArgs = (mailService.sendMagicLink as jest.Mock).mock
        .calls[0][0];
      expect(callArgs.clientEmail).toBe(clientA.email);
      magicLinkToken = callArgs.token;

      expect(magicLinkToken).toBeDefined();
      expect(magicLinkToken.length).toBeGreaterThan(10);
    });

    it('Should verify magic link successfully for correct tenant (implicit)', async () => {
      // Verification doesn't usually require explicit tenant ID in payload if we just send token?
      // But wait, the Controller might not know the tenant context unless it's sent in header/subdomain
      // OR if the service looks up strictly by hash (which is globally unique enough).
      // HOWEVER, our fix added `tenantId` to the lookup!
      // Method: `verifyMagicLink(token)`.
      // Inside: `TenantContextService.getTenantId()`.

      // If we call the endpoint without X-Tenant-ID header, TenantContext might be undefined or 'public'.
      // Let's see how `TenantContextMiddleware` works.
      // If it relies on `X-Tenant-ID`, we MUST send it.
      // If `ClientPortalController` is `@SkipTenant()`, then `getTenantId()` might return null.

      // CRITICAL CHECK: In `ClientAuthService.verifyMagicLink`:
      // `const tenantId = TenantContextService.getTenantId();`
      // `if (tenantId) whereClause.tenantId = tenantId;`

      // If the controller is skipped from tenant guard, does it still run tenant middleware?
      // Resolving tenant usually happens via Subdomain or Header.
      // For Client Portal, we typically want them to be on `tenant.app.com` or send `X-Tenant-ID`.

      // Let's try verifying WITHOUT specific tenant context header first.
      // If the token is unique, it should find it... UNLESS we enforced strict tenant isolation.
      // Our code says: `if (tenantId) { whereClause.tenantId = tenantId; }`
      // So if we don't send a tenant ID, it looks up purely by hash.
      // This is SECURE ONLY IF hashes are globally unique (SHA-256 of 32 bytes random is unique).
      // BUT, we want to ensure that if we DO send a wrong Tenant ID, it fails.

      const res = await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('X-Tenant-ID', clientA.tenantId)
        .send({ token: magicLinkToken })
        .expect(201); // Should succeed if hash matches

      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('Should FAIL when reusing the same magic link token (Single Use)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('X-Tenant-ID', clientA.tenantId)
        .send({ token: magicLinkToken })
        .expect(404); // Or 401, but likely NotFound because hash is cleared
    });

    // Test Cross-Tenant Magic Link Attack
    // Scenario: Client A has a magic link. Attacker tries to use it on Tenant B's portal.
    // If the system allows it, Attacker validates A's token but gets a session for... A?
    it('Refetching token for isolation test...', async () => {
      // Reset: Generate new token for A
      (mailService.sendMagicLink as jest.Mock).mockClear();
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/request-magic-link')
        .set('X-Tenant-ID', clientA.tenantId)
        .send({ email: clientA.email })
        .expect(201);

      const callArgs = (mailService.sendMagicLink as jest.Mock).mock
        .calls[0][0];
      magicLinkToken = callArgs.token;
    });

    it('Should FAIL to verify Client A token when context is Tenant B', async () => {
      // We simulate a request arriving at "tenant-b.app.com" (or via X-Tenant-ID header)
      // The TenantMiddleware should set context to Tenant B
      // Then VerifyMagicLink runs.
      // It sees tenantContext = Tenant B.
      // It adds `where: { hash: ..., tenantId: 'TenantB' }`.
      // The client is actually in Tenant A.
      // So lookup should FAIL.

      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('X-Tenant-ID', tenantB.tenantId) // Simulate request to Tenant B
        .send({ token: magicLinkToken })
        .expect(404); // Should not find the token in Tenant B's scope
    });

    it('Should verify successfully when context is Tenant A', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('X-Tenant-ID', tenantA.tenantId) // Correct Tenant
        .send({ token: magicLinkToken })
        .expect(201);
    });
  });
});
