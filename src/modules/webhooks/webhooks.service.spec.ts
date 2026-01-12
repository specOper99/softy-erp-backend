import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TEST_SECRETS } from '../../../test/secrets';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import {
  WebhookConfig,
  WebhookEvent,
  WebhookService,
} from './webhooks.service';

// Mock dns/promises
jest.mock('node:dns/promises', () => ({
  lookup: jest
    .fn()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

import { lookup } from 'node:dns/promises';

describe('WebhookService', () => {
  let service: WebhookService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockWebhookRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockImplementation((s: string) => `encrypted:${s}`),
    decrypt: jest
      .fn()
      .mockImplementation((s: string) => s.replace('encrypted:', '')),
    isEncrypted: jest
      .fn()
      .mockImplementation((s: string) => s.startsWith('encrypted:')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockWebhookRepository,
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);

    // Mock global fetch correctly for Node
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerWebhook and emit', () => {
    const tenantId = 'tenant-1';
    const config: WebhookConfig = {
      url: 'https://example.com/webhook',
      secret: TEST_SECRETS.WEBHOOK_SECRET,
      events: ['booking.created'],
    };

    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId: tenantId,
      payload: { id: '123' },
      timestamp: new Date().toISOString(),
    };

    it('should send webhook if event type matches', async () => {
      mockWebhookRepository.find.mockResolvedValue([config]);
      await service.emit(event);

      expect(global.fetch).toHaveBeenCalledWith(
        config.url,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Timestamp': expect.any(String),
            'X-Webhook-Event': 'booking.created',
          }),
          body: JSON.stringify(event),
        }),
      );
    });

    it('should send webhook if wildcard event is registered', async () => {
      const wildcardConfig = { ...config, events: ['*'] };
      mockWebhookRepository.find.mockResolvedValue([wildcardConfig]);
      await service.emit(event);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should not send webhook if event type does not match', async () => {
      const unmatchedEvent: WebhookEvent = { ...event, type: 'task.created' };
      mockWebhookRepository.find.mockResolvedValue([config]);
      await service.emit(unmatchedEvent);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should log error if fetch fails', async () => {
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      mockWebhookRepository.find.mockResolvedValue([config]);
      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('registerWebhook', () => {
    const tenantId = 'tenant-1';

    it('should persist valid HTTPS webhook URL with sufficient secret', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'a-very-long-secret-that-is-at-least-32-characters', // Keeping this explicit for validation test or change to constant if length matches
        events: ['booking.created'],
      };

      mockWebhookRepository.create.mockReturnValue({
        tenantId,
        ...config,
        secret: 'encrypted:' + config.secret,
      });
      mockWebhookRepository.save.mockResolvedValue({ id: 'webhook-1' });

      await service.registerWebhook(tenantId, config);

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(config.secret);
      expect(mockWebhookRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          url: config.url,
          secret: 'encrypted:' + config.secret,
          events: config.events,
          resolvedIps: ['93.184.216.34'],
          ipsResolvedAt: expect.any(Date),
        }),
      );
      expect(mockWebhookRepository.save).toHaveBeenCalled();
    });

    it('should reject invalid URL format', async () => {
      const config: WebhookConfig = {
        url: 'not-a-valid-url',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.invalid_url',
      );
    });

    it('should reject non-HTTP/HTTPS protocols', async () => {
      const config: WebhookConfig = {
        url: 'ftp://example.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        BadRequestException,
      );
      // Checking for key in parameterized error is complex with simple toThrow, skipping specific key check or using simpler check if possible.
      // Actually invalid_protocol is retained as Error inside try, but catch wraps it as BadRequest 'webhooks.invalid_url'
      // So checking type is good enough or substring of new message.
      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.invalid_url',
      );
    });

    it('should reject secrets shorter than minimum length', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'short-secret',
        events: ['booking.created'],
      };

      // Expect BadRequestException. If parameterized, message might not match directly.
      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject localhost URLs (SSRF prevention)', async () => {
      const config: WebhookConfig = {
        url: 'http://localhost:3000/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.localhost_denied',
      );
    });

    it('should reject 127.0.0.1 URLs (SSRF prevention)', async () => {
      const config: WebhookConfig = {
        url: 'http://127.0.0.1:3000/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.localhost_denied',
      );
    });

    it('should reject private IP ranges (10.x.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'http://10.0.0.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.private_ip_denied',
      );
    });

    it('should reject private IP ranges (192.168.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'http://192.168.1.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.private_ip_denied',
      );
    });

    it('should reject private IP ranges (172.16-31.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'http://172.16.0.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.private_ip_denied',
      );
    });

    it('should reject URLs that DNS-resolve to private IPs', async () => {
      (lookup as jest.Mock).mockResolvedValueOnce([
        { address: '10.0.0.1', family: 4 },
      ]);

      const config: WebhookConfig = {
        url: 'https://internal.example.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'webhooks.private_ip_denied',
      );
    });
  });

  describe('timeout handling', () => {
    const tenantId = 'tenant-1';
    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId: tenantId,
      payload: { id: '123' },
      timestamp: new Date().toISOString(),
    };

    it('should handle request timeout with AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValue(abortError);

      const config = {
        url: 'https://slow-server.com/webhook',
        secret: 'test-secret',
        events: ['booking.created'],
        isActive: true,
      };
      mockWebhookRepository.find.mockResolvedValue([config]);

      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Webhook request timed out'),
      );
    });

    it('should rethrow non-abort errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const config = {
        url: 'https://failing-server.com/webhook',
        secret: 'test-secret',
        events: ['booking.created'],
        isActive: true,
      };
      mockWebhookRepository.find.mockResolvedValue([config]);

      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
      );
    });
  });

  describe('webhook signature', () => {
    it('should include timestamp in signature header', async () => {
      const tenantId = 'tenant-1';
      const config = {
        url: 'https://example.com/webhook',
        secret: 'encrypted:test-secret',
        events: ['booking.created'],
        isActive: true,
      };
      const event: WebhookEvent = {
        type: 'booking.created',
        tenantId: tenantId,
        payload: { id: '123' },
        timestamp: new Date().toISOString(),
      };

      mockWebhookRepository.find.mockResolvedValue([config]);
      await service.emit(event);

      expect(global.fetch).toHaveBeenCalledWith(
        config.url,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Timestamp': expect.stringMatching(/^\d+$/),
          }),
        }),
      );
    });
  });
});
