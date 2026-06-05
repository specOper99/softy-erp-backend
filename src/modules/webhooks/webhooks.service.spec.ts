import { Test, type TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhooks.service';
import { WebhookRepository } from './repositories/webhook.repository';
import { WebhookDeliveryRepository } from './repositories/webhook-delivery.repository';
import { EncryptionService } from '../../common/services/encryption.service';
import { MetricsFactory } from '../../common/services/metrics.factory';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { getQueueToken } from '@nestjs/bullmq';
import { WEBHOOK_QUEUE, type WebhookEvent } from './webhooks.types';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import { Webhook as StandardWebhook } from 'standardwebhooks';
import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

jest.mock('node:https');
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() => Promise.resolve([{ address: '1.1.1.1', family: 4 }])),
}));

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

describe('WebhookService Unit Tests', () => {
  let service: WebhookService;
  let webhookRepository: jest.Mocked<WebhookRepository>;
  let webhookDeliveryRepository: jest.Mocked<WebhookDeliveryRepository>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let metricsFactory: jest.Mocked<MetricsFactory>;
  let counterIncSpy: jest.Mock;
  const tenantId = '00000000-0000-0000-0000-000000000000';

  beforeEach(async () => {
    counterIncSpy = jest.fn();
    const mockCounter = {
      inc: counterIncSpy,
    };

    webhookRepository = {
      create: jest.fn((dto) => dto as any),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    webhookDeliveryRepository = {
      create: jest.fn((dto) => {
        const delivery = new WebhookDelivery();
        Object.assign(delivery, dto);
        delivery.id = '11111111-1111-1111-1111-111111111111';
        return delivery;
      }),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as any;

    encryptionService = {
      encrypt: jest.fn((val) => `enc_${val}`),
      decrypt: jest.fn((val) => val.replace('enc_', '')),
      isEncrypted: jest.fn((val) => val.startsWith('enc_')),
    } as any;

    metricsFactory = {
      getOrCreateCounter: jest.fn(() => mockCounter),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: WebhookRepository, useValue: webhookRepository },
        { provide: WebhookDeliveryRepository, useValue: webhookDeliveryRepository },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: MetricsFactory, useValue: metricsFactory },
        { provide: getQueueToken(WEBHOOK_QUEUE), useValue: null },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);
    (lookup as jest.Mock).mockClear().mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registerWebhook', () => {
    it('should validate protocol and block non-https URLs', async () => {
      await expect(
        service.registerWebhook({
          url: 'http://example.com/webhook',
          secret: 'super-secret-key-32-chars-long-length',
          events: ['*'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject short secrets', async () => {
      await expect(
        service.registerWebhook({
          url: 'https://example.com/webhook',
          secret: 'short',
          events: ['*'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully register a valid webhook', async () => {
      const dto = {
        url: 'https://example.com/webhook',
        secret: 'super-secret-key-32-chars-long-length',
        events: ['*'],
      };

      await service.registerWebhook(dto);

      expect(webhookRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: dto.url,
          secret: 'enc_super-secret-key-32-chars-long-length',
          events: dto.events,
        }),
      );
      expect(webhookRepository.save).toHaveBeenCalled();
    });

    it('should prevent SSRF by blocking private IPs', async () => {
      (lookup as jest.Mock).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
      await expect(
        service.registerWebhook({
          url: 'https://localhost-mock.com/webhook',
          secret: 'super-secret-key-32-chars-long-length',
          events: ['*'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Webhook Delivery Headers', () => {
    it('should send standard, legacy, and deprecation warning headers', async () => {
      const webhook = new Webhook();
      webhook.id = '22222222-2222-2222-2222-222222222222';
      webhook.url = 'https://webhook.site/target';
      webhook.secret = 'enc_super-secret-key-32-chars-long-length';
      webhook.tenantId = tenantId;
      webhook.events = ['booking.created'];
      webhook.resolvedIps = ['1.1.1.1'];

      const event: WebhookEvent = {
        type: 'booking.created',
        tenantId,
        payload: { id: 'booking-1' },
        timestamp: new Date().toISOString(),
      };

      // Mock DB load
      webhookRepository.findOne.mockResolvedValue(webhook);

      // Mock Http Request
      const httpsRequestOutcomes: any[] = [{ statusCode: 200, statusMessage: 'OK' }];
      let capturedHeaders: Record<string, string> = {};

      const mockRequest = (options: any, callback: any) => {
        capturedHeaders = options.headers;
        const req = new MockClientRequest();
        req.end = function () {
          const outcome = httpsRequestOutcomes.shift() || { statusCode: 200, statusMessage: 'OK' };
          const res = new MockIncomingMessage(outcome.statusCode, outcome.statusMessage);
          callback(res);
          setImmediate(() => {
            res.emit('end');
            this.emit('close');
          });
          return this;
        };
        return req as any;
      };

      jest.spyOn(https, 'request').mockImplementation(mockRequest as any);

      // Trigger Delivery
      await service.deliverWebhook(webhook, event);

      // Assert legacy headers exist
      expect(capturedHeaders['X-Webhook-Signature']).toBeDefined();
      expect(capturedHeaders['X-Webhook-Timestamp']).toBeDefined();
      expect(capturedHeaders['X-Webhook-Event']).toBe('booking.created');

      // Assert metric counter incremented
      expect(counterIncSpy).toHaveBeenCalledWith({
        tenant_id: tenantId,
        event_type: 'booking.created',
      });

      // Assert deprecation warning header exists with target date 2026-07-03
      expect(capturedHeaders['Webhook-Signature-Deprecation']).toBe('2026-07-03');

      // Assert standard webhooks headers exist
      expect(capturedHeaders['webhook-id']).toBe('11111111-1111-1111-1111-111111111111');
      expect(capturedHeaders['webhook-timestamp']).toBeDefined();
      expect(capturedHeaders['webhook-signature']).toBeDefined();

      // Verify the signature with StandardWebhooks library using a raw secret
      const stdWh = new StandardWebhook('super-secret-key-32-chars-long-length', { format: 'raw' });
      const payloadString = JSON.stringify(event);

      const verifyHeaders = {
        'webhook-id': capturedHeaders['webhook-id']!,
        'webhook-timestamp': capturedHeaders['webhook-timestamp']!,
        'webhook-signature': capturedHeaders['webhook-signature']!,
      };

      // Verify signature parses and validates payload correctly
      const verifiedPayload = stdWh.verify(payloadString, verifyHeaders);
      expect(verifiedPayload).toEqual(event);
    });
  });
});
