import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request, { Response as SupertestResponse } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { IpRateLimitGuard } from '../src/common/guards/ip-rate-limit.guard';
import { TransformInterceptor } from '../src/common/interceptors';
import { Client } from '../src/modules/bookings/entities/client.entity';
import { MailService } from '../src/modules/mail/mail.service';
import { ReviewsService } from '../src/modules/reviews/services/reviews.service';
import { Tenant } from '../src/modules/tenants/entities/tenant.entity';
import { seedTestDatabase } from './utils/seed-data';

class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Client Portal (e2e)', () => {
  jest.setTimeout(60000);
  const sendMagicLinkMock = jest.fn().mockResolvedValue({ success: true });
  const originalRateLimitEnabled = process.env.RATE_LIMIT_ENABLED;

  let app: INestApplication;
  let clientRepository: Repository<Client>;
  let tenantRepository: Repository<Tenant>;
  let testClient: Client;
  let tenantSlug: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useClass(MockThrottlerGuard)
      .overrideProvider(IpRateLimitGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideProvider(MailService)
      .useValue({
        sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
        sendTaskAssignment: jest.fn().mockResolvedValue(undefined),
        sendPayrollNotification: jest.fn().mockResolvedValue(undefined),
        queueEmailVerification: jest.fn().mockResolvedValue(undefined),
        queuePasswordReset: jest.fn().mockResolvedValue(undefined),
        sendMagicLink: sendMagicLinkMock,
      })
      .overrideProvider(ReviewsService)
      .useValue({
        findApprovedByPackage: jest.fn().mockResolvedValue([[], 0]),
        getApprovedAggregatesByPackageIds: jest.fn().mockResolvedValue([]),
        checkDuplicateReview: jest.fn().mockResolvedValue(false),
        create: jest.fn(),
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

    const dataSource = moduleFixture.get<DataSource>(DataSource);
    clientRepository = dataSource.getRepository(Client);
    tenantRepository = dataSource.getRepository(Tenant);

    // Seed Test DB and Get Tenant ID
    const seedData = await seedTestDatabase(dataSource);

    // Get tenant slug for Host header
    const tenant = await tenantRepository.findOne({
      where: { id: seedData.tenantId },
    });
    tenantSlug = tenant?.slug || seedData.tenantId;

    // Create a test client for portal tests
    testClient = await clientRepository.save({
      name: 'Portal Test Client',
      email: `portal.test.${Date.now()}@example.com`,
      phone: '+1234567890',
      tenantId: seedData.tenantId,
    });
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = originalRateLimitEnabled;

    // Cleanup test client
    if (testClient?.id) {
      await clientRepository.delete(testClient.id);
    }
    await app?.close();
  });

  // Helper to set tenant context via subdomain (Host header)
  const hostHeader = () => `${tenantSlug}.example.com`;

  describe('Magic Link Authentication', () => {
    it('POST /client-portal/:slug/auth/request-magic-link should accept valid email', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/client-portal/${tenantSlug}/auth/request-magic-link`)
        .set('Host', hostHeader())
        .send({ email: testClient.email, tenantSlug })
        .expect(200);

      // Response is wrapped in { data: { message: ... } } by TransformInterceptor
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('magic link');
    });

    it('POST /client-portal/:slug/auth/request-magic-link should not reveal non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/client-portal/${tenantSlug}/auth/request-magic-link`)
        .set('Host', hostHeader())
        .send({ email: 'nonexistent@example.com', tenantSlug })
        .expect(200);

      // Same message for security (doesn't reveal if email exists)
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('magic link');
    });

    it('POST /client-portal/auth/verify should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('Host', hostHeader())
        .send({ token: 'invalid-token', tenantSlug })
        .expect(401);
    });
  });

  describe('Protected Endpoints', () => {
    it('GET /client-portal/bookings should require token', async () => {
      await request(app.getHttpServer()).get('/api/v1/client-portal/bookings').expect(401);
    });

    it('GET /client-portal/profile should require token', async () => {
      await request(app.getHttpServer()).get('/api/v1/client-portal/profile').expect(401);
    });
  });

  describe('Public Catalog Endpoints', () => {
    it('GET /client-portal/listings should return 200 for seeded tenant', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/client-portal/listings?tenantSlug=${tenantSlug}`)
        .set('Host', hostHeader())
        .expect(200);
    });

    it('GET /client-portal/listings/featured should return 200 for seeded tenant', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/client-portal/listings/featured?tenantSlug=${tenantSlug}`)
        .set('Host', hostHeader())
        .expect(200);
    });

    it('GET /client-portal/:slug/packages should return 200 for seeded tenant', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/client-portal/${tenantSlug}/packages`)
        .set('Host', hostHeader())
        .expect(200);
    });
  });

  describe('Authenticated Access', () => {
    let accessToken: string;

    beforeAll(async () => {
      sendMagicLinkMock.mockClear();
      await request(app.getHttpServer())
        .post(`/api/v1/client-portal/${tenantSlug}/auth/request-magic-link`)
        .set('Host', hostHeader())
        .send({ email: testClient.email, tenantSlug })
        .expect(200);

      const latestCall = sendMagicLinkMock.mock.calls[sendMagicLinkMock.mock.calls.length - 1] as
        | [{ token?: string }]
        | undefined;
      const [mailPayload] = latestCall ?? [];
      const magicToken = (mailPayload as { token?: string } | undefined)?.token;
      expect(magicToken).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('Host', hostHeader())
        .send({ token: magicToken, tenantSlug })
        .expect(201);

      accessToken = response.body.data.accessToken;
    });

    it('POST /client-portal/auth/logout should invalidate token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/logout')
        .set('Host', hostHeader())
        .set('x-client-token', accessToken)
        .expect(200);

      // Token should now be invalid
      await request(app.getHttpServer())
        .get('/api/v1/client-portal/bookings')
        .set('Host', hostHeader())
        .set('x-client-token', accessToken)
        .expect(401);
    });
  });

  describe('Tenant Context Isolation Under Concurrency', () => {
    type RegisteredTenant = {
      tenantId: string;
      tenantSlug: string;
      email: string;
      password: string;
    };

    type TokenizedClient = {
      client: Client;
      accessToken: string;
      tenantSlug: string;
    };

    const timestamp = Date.now();
    let tenantA: RegisteredTenant;
    let tenantB: RegisteredTenant;
    const createdClientIds: string[] = [];

    const registerTenant = async (email: string, companyName: string, password: string): Promise<RegisteredTenant> => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          companyName,
        })
        .expect(201);

      const tenantId = response.body.data.user.tenantId as string;
      const tenant = await tenantRepository.findOne({ where: { id: tenantId } });
      expect(tenant).toBeDefined();

      return {
        tenantId,
        tenantSlug: tenant?.slug ?? tenantId,
        email,
        password,
      };
    };

    const issueClientToken = async (tenantSlugValue: string, email: string): Promise<string> => {
      const initialCallCount = sendMagicLinkMock.mock.calls.length;

      await request(app.getHttpServer())
        .post(`/api/v1/client-portal/${tenantSlugValue}/auth/request-magic-link`)
        .set('Host', `${tenantSlugValue}.example.com`)
        .send({ email, tenantSlug: tenantSlugValue })
        .expect(200);

      const newCalls = sendMagicLinkMock.mock.calls.slice(initialCallCount);
      expect(newCalls.length).toBeGreaterThan(0);

      const [mailPayload] = (newCalls[newCalls.length - 1] ?? []) as [{ token?: string }] | [];
      const magicToken = mailPayload?.token;
      expect(magicToken).toBeDefined();

      const verifyResponse = await request(app.getHttpServer())
        .post('/api/v1/client-portal/auth/verify')
        .set('Host', `${tenantSlugValue}.example.com`)
        .send({ token: magicToken, tenantSlug: tenantSlugValue })
        .expect(201);

      return verifyResponse.body.data.accessToken as string;
    };

    const buildTokenizedClient = async (tenant: RegisteredTenant, name: string): Promise<TokenizedClient> => {
      const client = await clientRepository.save({
        name,
        email: `portal.concurrent.${tenant.tenantSlug}.${Date.now()}@example.com`,
        phone: '+1234567890',
        tenantId: tenant.tenantId,
      });

      createdClientIds.push(client.id);
      const accessToken = await issueClientToken(tenant.tenantSlug, client.email);

      return {
        client,
        accessToken,
        tenantSlug: tenant.tenantSlug,
      };
    };

    beforeAll(async () => {
      tenantA = await registerTenant(
        `client-portal-concurrency-a-${timestamp}@example.com`,
        `cta-${timestamp}`,
        'TestPassword123!',
      );
      tenantB = await registerTenant(
        `client-portal-concurrency-b-${timestamp}@example.com`,
        `ctb-${timestamp}`,
        'TestPassword123!',
      );
    });

    afterAll(async () => {
      if (createdClientIds.length > 0) {
        await clientRepository.delete(createdClientIds);
      }
    });

    it('GET /client-portal/profile should keep tenant context isolated across concurrent token requests', async () => {
      const clientA = await buildTokenizedClient(tenantA, 'Concurrent Client A');
      const clientB = await buildTokenizedClient(tenantB, 'Concurrent Client B');

      const requestPairs = 20;
      const concurrentPairsPerBatch = 1;
      const profileRequestTemplate: Array<{
        expectedEmail: string;
        unexpectedEmail: string;
        expectedId: string;
        tenantSlug: string;
        execute: () => Promise<SupertestResponse>;
      }> = [];

      for (let i = 0; i < concurrentPairsPerBatch; i += 1) {
        profileRequestTemplate.push({
          expectedEmail: clientA.client.email,
          unexpectedEmail: clientB.client.email,
          expectedId: clientA.client.id,
          tenantSlug: clientA.tenantSlug,
          execute: () =>
            request(app.getHttpServer())
              .get('/api/v1/client-portal/profile')
              .set('Host', `${clientA.tenantSlug}.example.com`)
              .set('x-client-token', clientA.accessToken),
        });

        profileRequestTemplate.push({
          expectedEmail: clientB.client.email,
          unexpectedEmail: clientA.client.email,
          expectedId: clientB.client.id,
          tenantSlug: clientB.tenantSlug,
          execute: () =>
            request(app.getHttpServer())
              .get('/api/v1/client-portal/profile')
              .set('Host', `${clientB.tenantSlug}.example.com`)
              .set('x-client-token', clientB.accessToken),
        });
      }

      for (let completedPairs = 0; completedPairs < requestPairs; completedPairs += concurrentPairsPerBatch) {
        const batchResponses = await Promise.all(profileRequestTemplate.map((entry) => entry.execute()));

        batchResponses.forEach((response, index) => {
          const expected = profileRequestTemplate[index];
          expect(response.status).toBe(200);
          expect(response.body.data.email).toBe(expected.expectedEmail);
          expect(response.body.data.id).toBe(expected.expectedId);
          expect(response.body.data.tenantSlug).toBe(expected.tenantSlug);
          expect(response.body.data.email).not.toBe(expected.unexpectedEmail);
        });
      }
    });
  });
});
