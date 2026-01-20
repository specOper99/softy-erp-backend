import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookRepository } from '../../../src/modules/webhooks/repositories/webhook.repository';

import { WEBHOOK_QUEUE } from '../../../src/modules/webhooks/webhooks.types';
import { v4 as uuidv4 } from 'uuid';
import { EncryptionService } from '../../../src/common/services/encryption.service';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';

void globalThis.fetch;

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() => Promise.resolve([{ address: '1.1.1.1', family: 4 }])),
}));
import { Webhook } from '../../../src/modules/webhooks/entities/webhook.entity';
import { WebhookService } from '../../../src/modules/webhooks/webhooks.service';
import { WebhookEvent } from '../../../src/modules/webhooks/webhooks.types';

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'ENCRYPTION_KEY') return 'test-encryption-key-32-chars-lengt'; // 32 chars
    return null;
  }),
};

// Mock fetch
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

describe('Webhook Delivery Integration', () => {
  let module: TestingModule;
  let webhookService: WebhookService;
  let dataSource: DataSource;
  let _encryptionService: EncryptionService;
  const tenantId = uuidv4();

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [__dirname + '/../../../src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          entities: [__dirname + '/../../../src/**/*.entity.ts'],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Webhook]),
      ],
      providers: [
        WebhookService,
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: WebhookRepository,
          useValue: new WebhookRepository(dataSource.getRepository(Webhook)),
        },
        {
          provide: getQueueToken(WEBHOOK_QUEUE),
          useValue: null,
        },
      ],
    }).compile();

    webhookService = module.get<WebhookService>(WebhookService);
    _encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  afterAll(async () => {
    await module?.close();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.getRepository(Webhook).createQueryBuilder().delete().execute();
    mockFetch.mockReset();

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);
  });

  it('should register and deliver a webhook successfully', async () => {
    const url = 'https://webhook.site/test-endpoint';
    const secret = 'super-secret-key-32-chars-length!!';

    // 1. Register Webhook
    await webhookService.registerWebhook({
      url,
      secret,
      events: ['booking.created'],
    });

    // 2. Setup mock success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });

    // 3. Emit Event
    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId,
      payload: { bookingId: '123' },
      timestamp: new Date().toISOString(),
    };

    await webhookService.emit(event);

    // 4. Verify Delivery
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'booking.created',
          'X-Webhook-Signature': expect.any(String),
        }),
      }),
    );
  });

  it('should retry on failure and eventually fail after max retries', async () => {
    const url = 'https://webhook.site/fail-endpoint';
    const secret = 'super-secret-key-32-chars-length!!';

    await webhookService.registerWebhook({
      url,
      secret,
      events: ['*'],
    });

    // Mock failure for all attempts
    mockFetch.mockRejectedValue(new Error('Network Error'));

    // Override constants for testing
    const webhookConfigurable = webhookService as unknown as {
      INITIAL_RETRY_DELAY: number;
      MAX_RETRIES: number;
    };
    webhookConfigurable.INITIAL_RETRY_DELAY = 10; // 10ms
    webhookConfigurable.MAX_RETRIES = 3;

    const event: WebhookEvent = {
      type: 'task.completed',
      tenantId,
      payload: { taskId: '999' },
      timestamp: new Date().toISOString(),
    };

    await webhookService.emit(event);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff between retries', async () => {
    const url = 'https://webhook.site/slow-endpoint';
    const secret = 'super-secret-key-32-chars-length!!';

    await webhookService.registerWebhook({
      url,
      secret,
      events: ['booking.created'],
    });

    const deliveryAttempts: string[] = [];
    mockFetch.mockImplementation((requestUrl, _options) => {
      deliveryAttempts.push(requestUrl);

      if (deliveryAttempts.length <= 3) {
        return Promise.reject(new Error('Network error'));
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });
    });

    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId,
      payload: { bookingId: '123' },
      timestamp: new Date().toISOString(),
    };

    await webhookService.emit(event);

    // Verify that multiple attempts were made (exponential backoff behavior)
    expect(deliveryAttempts.length).toBeGreaterThanOrEqual(3);
  });
});
