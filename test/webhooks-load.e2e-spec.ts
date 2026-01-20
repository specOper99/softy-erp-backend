import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors';
import { TenantContextService } from '../src/common/services/tenant-context.service';
import { MailService } from '../src/modules/mail/mail.service';
import { Webhook } from '../src/modules/webhooks/entities/webhook.entity';
import { WebhookService } from '../src/modules/webhooks/webhooks.service';
import { seedTestDatabase } from './utils/seed-data';

// Mock ThrottlerGuard
class MockThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('Webhooks Load E2E Tests', () => {
  let app: INestApplication;
  let _accessToken: string;
  let webhookService: WebhookService;
  let testTenantId: string;

  beforeAll(async () => {
    // Mock global fetch to avoid actual network calls
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('OK'),
        json: () => Promise.resolve({ success: true }),
      } as Response),
    );

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
      })
      // Force WebhookService to use inline delivery by not providing the queue
      // Force WebhookService to use inline delivery by not providing the queue
      .overrideProvider(getQueueToken('webhook'))
      .useValue(null)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
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
    const seedResult = await seedTestDatabase(dataSource);
    testTenantId = seedResult.tenantId;
    const tenantHost = `${seedResult.tenantId}.example.com`;
    webhookService = app.get(WebhookService);

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Host', tenantHost)
      .send({
        email: seedResult.admin.email,
        password: process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!',
      });
    _accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('should handle high volume of webhooks concurrently', async () => {
    // 1. Register 50 Webhooks using Service directly with TenantContextService
    const webhookCount = 50;

    for (let i = 0; i < webhookCount; i++) {
      await TenantContextService.run(testTenantId, async () => {
        await webhookService.registerWebhook({
          url: `https://example.com/webhook-${i}`,
          secret: `very-long-secret_key_for_testing_${i}`, // > 32 chars
          events: ['booking.created'],
        });
      });
    }

    // 2. Trigger an event
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    const event = {
      type: 'booking.created' as const,
      tenantId: testTenantId,
      payload: { id: 'test-booking-id' },
      timestamp: new Date().toISOString(),
    };

    // Debug: Check if webhooks exist
    // Check if webhooks exist
    const dataSource = app.get(DataSource);
    const webhooks = await dataSource.getRepository(Webhook).find({ where: { tenantId: testTenantId } });
    expect(webhooks.length).toBe(webhookCount);

    const startTime = Date.now();
    await webhookService.emit(event);
    const duration = Date.now() - startTime;

    // 3. Verify
    expect(fetchSpy).toHaveBeenCalledTimes(webhookCount);

    console.log(`Processed ${webhookCount} webhooks in ${duration}ms`);
  }, 30000);
});
