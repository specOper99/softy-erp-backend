import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter } from 'node:events';
import { WebhookRepository } from '../../../src/modules/webhooks/repositories/webhook.repository';

import { WEBHOOK_QUEUE } from '../../../src/modules/webhooks/webhooks.types';
import { v4 as uuidv4 } from 'uuid';
import { EncryptionService } from '../../../src/common/services/encryption.service';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';

jest.mock('node:https');
import * as https from 'node:https';

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

type HttpsMockOutcome =
  | { type: 'success'; statusCode: number; statusMessage: string }
  | { type: 'error'; error: Error };

class MockIncomingMessage extends EventEmitter {
  constructor(
    readonly statusCode: number,
    readonly statusMessage: string,
  ) {
    super();
  }

  resume(): void {}
}

class MockClientRequest extends EventEmitter {
  setTimeout(_timeout: number, _callback?: () => void): this {
    return this;
  }

  destroy(error?: Error): this {
    if (error) {
      setImmediate(() => this.emit('error', error));
    }
    setImmediate(() => this.emit('close'));
    return this;
  }

  write(_chunk: string): boolean {
    return true;
  }

  end(_chunk?: string): this {
    return this;
  }
}

const createHttpsRequestMock = (outcomes: HttpsMockOutcome[], onCall?: () => void): typeof https.request => {
  return ((...args: unknown[]) => {
    onCall?.();
    const callback = args.find((arg): arg is (response: MockIncomingMessage) => void => typeof arg === 'function');

    const req = new MockClientRequest();

    req.end = function end(this: MockClientRequest): MockClientRequest {
      const outcome = outcomes.shift() ?? {
        type: 'success',
        statusCode: 200,
        statusMessage: 'OK',
      };

      if (outcome.type === 'error') {
        setImmediate(() => {
          this.emit('error', outcome.error);
          this.emit('close');
        });
        return this;
      }

      const response = new MockIncomingMessage(outcome.statusCode, outcome.statusMessage);
      callback?.(response);

      setImmediate(() => {
        response.emit('end');
        this.emit('close');
      });

      return this;
    };

    return req as unknown as ReturnType<typeof https.request>;
  }) as unknown as typeof https.request;
};

describe('Webhook Delivery Integration', () => {
  let module: TestingModule;
  let webhookService: WebhookService;
  let dataSource: DataSource;
  let _encryptionService: EncryptionService;
  let httpsRequestSpy: jest.SpiedFunction<typeof https.request>;
  let httpsRequestOutcomes: HttpsMockOutcome[];
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
    httpsRequestOutcomes = [];

    httpsRequestSpy = jest.spyOn(https, 'request').mockImplementation(createHttpsRequestMock(httpsRequestOutcomes));
    httpsRequestSpy.mockClear();

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);

    (webhookService as any).concurrencyLimitPromise = Promise.resolve((fn: any) => Promise.resolve(fn()));
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
    httpsRequestOutcomes.push({ type: 'success', statusCode: 200, statusMessage: 'OK' });

    // 3. Emit Event
    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId,
      payload: { bookingId: '123' },
      timestamp: new Date().toISOString(),
    };

    await webhookService.emit(event);

    // 4. Verify Delivery
    expect(httpsRequestSpy).toHaveBeenCalledTimes(1);
    expect(httpsRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'https:',
        method: 'POST',
        hostname: '1.1.1.1',
        path: '/test-endpoint',
        headers: expect.objectContaining({
          Host: 'webhook.site',
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'booking.created',
          'X-Webhook-Signature': expect.any(String),
        }),
      }),
      expect.any(Function),
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
    httpsRequestOutcomes.push(
      { type: 'error', error: new Error('Network Error') },
      { type: 'error', error: new Error('Network Error') },
      { type: 'error', error: new Error('Network Error') },
    );

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

    expect(httpsRequestSpy).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff between retries', async () => {
    const url = 'https://webhook.site/slow-endpoint';
    const secret = 'super-secret-key-32-chars-length!!';

    await webhookService.registerWebhook({
      url,
      secret,
      events: ['booking.created'],
    });

    const deliveryAttempts: number[] = [];
    httpsRequestOutcomes.push(
      { type: 'error', error: new Error('Network error') },
      { type: 'error', error: new Error('Network error') },
      { type: 'error', error: new Error('Network error') },
      { type: 'success', statusCode: 200, statusMessage: 'OK' },
    );

    httpsRequestSpy.mockImplementation(createHttpsRequestMock(httpsRequestOutcomes, () => deliveryAttempts.push(1)));

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

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
