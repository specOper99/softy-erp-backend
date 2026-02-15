import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockRepository, mockTenantContext } from '../../../test/helpers/mock-factories';
import { TEST_SECRETS } from '../../../test/secrets';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import { WebhookRepository } from './repositories/webhook.repository';
import { WebhookService } from './webhooks.service';
import { WebhookConfig, WebhookEvent } from './webhooks.types';

// Mock dns/promises
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

// Mock p-limit - return a limiter that immediately invokes the function
jest.mock('p-limit', () => ({
  default: jest.fn(
    () =>
      <T>(fn: () => T | Promise<T>) =>
        fn(),
  ),
}));

import { lookup } from 'node:dns/promises';

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookRepository: jest.Mocked<WebhookRepository>;
  let qb: { andWhere: jest.Mock; getMany: jest.Mock };

  const mockTenantId = 'tenant-1';
  const mockConfigService = {
    get: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockImplementation((s: string) => `encrypted:${s}`),
    decrypt: jest.fn().mockImplementation((s: string) => s.replace('encrypted:', '')),
    isEncrypted: jest.fn().mockImplementation((s: string) => s.startsWith('encrypted:')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: WebhookRepository,
          useValue: createMockRepository(),
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    webhookRepository = module.get(WebhookRepository);

    qb = {
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    webhookRepository.createQueryBuilder = jest.fn().mockReturnValue(qb as any);

    // Mock TenantContext
    mockTenantContext(mockTenantId);

    // Mock global fetch correctly for Node
    (global as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
    } as unknown as Response);

    // Mock getConcurrencyLimit to return a no-op limiter
    jest.spyOn(service as any, 'getConcurrencyLimit').mockResolvedValue(<T>(fn: () => T | Promise<T>) => fn());

    // Speed up retries
    Object.defineProperty(service, 'INITIAL_RETRY_DELAY', { value: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerWebhook and emit', () => {
    const config: WebhookConfig = {
      url: 'https://example.com/webhook',
      secret: TEST_SECRETS.WEBHOOK_SECRET,
      events: ['booking.created'],
    };

    // Helper to create a full webhook entity from config
    const createWebhookEntity = (cfg: WebhookConfig): Webhook =>
      ({
        id: 'webhook-1',
        tenantId: mockTenantId,
        url: cfg.url,
        secret: `encrypted:${cfg.secret}`, // Simulate encrypted secret
        events: cfg.events,
        isActive: true,
        resolvedIps: ['93.184.216.34'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as Webhook;

    it('deliverWebhook should throw NotFoundException when webhook missing', async () => {
      const partial = { id: 'missing', tenantId: mockTenantId } as unknown as Webhook;
      webhookRepository.findOne.mockResolvedValue(null);
      await expect(
        service.deliverWebhook(partial, {
          type: 'booking.created',
          tenantId: mockTenantId,
          payload: {},
          timestamp: new Date().toISOString(),
        }),
      ).rejects.toThrow('webhooks.not_found');
    });

    it('deliverWebhook should load full webhook record when partial is provided', async () => {
      const event: WebhookEvent = {
        type: 'booking.created',
        tenantId: mockTenantId,
        payload: { id: '123' },
        timestamp: new Date().toISOString(),
      };

      const partial = { id: 'w-partial', tenantId: mockTenantId, resolvedIps: undefined } as unknown as Webhook;
      const full = {
        id: 'w-partial',
        tenantId: mockTenantId,
        url: 'https://example.com/webhook',
        secret: 'encrypted:test-secret',
        events: ['*'],
        resolvedIps: ['93.184.216.34'],
        isActive: true,
      } as unknown as Webhook;

      webhookRepository.findOne.mockResolvedValue(full);

      await service.deliverWebhook(partial, event);

      expect(webhookRepository.findOne).toHaveBeenCalledWith({ where: { id: 'w-partial' } });

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
        full.url,
        expect.objectContaining({
          method: 'POST',
          redirect: 'manual',
        }),
      );
    });

    it('deliverWebhook should not decrypt secret if it is not encrypted', async () => {
      const event: WebhookEvent = {
        type: 'booking.created',
        tenantId: mockTenantId,
        payload: { id: '123' },
        timestamp: new Date().toISOString(),
      };

      const webhook = {
        id: 'w-plain',
        tenantId: mockTenantId,
        url: 'https://example.com/webhook',
        secret: 'plain-secret',
        events: ['*'],
        resolvedIps: ['93.184.216.34'],
        isActive: true,
      } as unknown as Webhook;

      const decryptSpy = mockEncryptionService.decrypt as unknown as jest.Mock;
      decryptSpy.mockClear();
      await service.deliverWebhook(webhook, event);

      expect(decryptSpy).not.toHaveBeenCalled();
    });

    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId: mockTenantId,
      payload: { id: '123' },
      timestamp: new Date().toISOString(),
    };

    it('should send webhook if event type matches', async () => {
      const webhook = createWebhookEntity(config);
      qb.getMany.mockResolvedValue([webhook]);

      // Spy on the private sendWebhookWithRetry method
      const sendSpy = jest.spyOn(service as any, 'sendWebhookWithRetry').mockResolvedValue(undefined);

      await service.emit(event);

      // Check if sendWebhookWithRetry was called
      expect(sendSpy).toHaveBeenCalledWith(webhook, event);
      sendSpy.mockRestore();

      // Now test the actual flow
      qb.getMany.mockResolvedValue([webhook]);
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

    it('should apply database event filter for exact and wildcard matches', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.emit(event);

      expect(qb.andWhere).toHaveBeenNthCalledWith(1, 'webhook.isActive = :isActive', { isActive: true });
      expect(qb.andWhere).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(":ev = ANY(string_to_array(COALESCE(webhook.events, ''), ','))"),
        { ev: 'booking.created', wc: '*' },
      );
      expect(qb.andWhere).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(":wc = ANY(string_to_array(COALESCE(webhook.events, ''), ','))"),
        { ev: 'booking.created', wc: '*' },
      );
    });

    it('should send webhook if wildcard event is registered', async () => {
      const wildcardConfig = { ...config, events: ['*'] };
      const webhook = createWebhookEntity(wildcardConfig);
      qb.getMany.mockResolvedValue([webhook]);
      await service.emit(event);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should not send webhook if event type does not match', async () => {
      const unmatchedEvent: WebhookEvent = { ...event, type: 'task.created' };
      qb.getMany.mockResolvedValue([]);
      await service.emit(unmatchedEvent);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should log error if fetch fails', async () => {
      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const webhook = createWebhookEntity(config);
      qb.getMany.mockResolvedValue([webhook]);
      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('registerWebhook', () => {
    it('should persist valid HTTPS webhook URL with sufficient secret', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'a-very-long-secret-that-is-at-least-32-characters', // Keeping this explicit for validation test or change to constant if length matches
        events: ['booking.created'],
      };

      webhookRepository.create.mockReturnValue({
        ...config,
        secret: 'encrypted:' + config.secret,
      } as unknown as Webhook);
      webhookRepository.save.mockResolvedValue({ id: 'webhook-1' } as Webhook);

      await service.registerWebhook(config);

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(config.secret);
      expect(webhookRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: config.url,
          secret: 'encrypted:' + config.secret,
          events: config.events,
          resolvedIps: ['93.184.216.34'],
          ipsResolvedAt: expect.any(Date),
        }),
      );
      expect(webhookRepository.save).toHaveBeenCalled();
    });

    it('should reject invalid URL format', async () => {
      const config: WebhookConfig = {
        url: 'not-a-valid-url',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.invalid_url');
    });

    it('should reject non-HTTP/HTTPS protocols', async () => {
      const config: WebhookConfig = {
        url: 'ftp://example.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow(BadRequestException);
      // Checking for key in parameterized error is complex with simple toThrow, skipping specific key check or using simpler check if possible.
      // Actually invalid_protocol is retained as Error inside try, but catch wraps it as BadRequest 'webhooks.invalid_url'
      // So checking type is good enough or substring of new message.
      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.invalid_url');
    });

    it('should reject secrets shorter than minimum length', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'short-secret',
        events: ['booking.created'],
      };

      // Expect BadRequestException. If parameterized, message might not match directly.
      await expect(service.registerWebhook(config)).rejects.toThrow(BadRequestException);
    });

    it('should reject localhost URLs (SSRF prevention)', async () => {
      const config: WebhookConfig = {
        url: 'https://localhost:3000/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.localhost_denied');
    });

    it('should reject 127.0.0.1 URLs (SSRF prevention)', async () => {
      const config: WebhookConfig = {
        url: 'https://127.0.0.1:3000/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.localhost_denied');
    });

    it('should reject private IP ranges (10.x.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'https://10.0.0.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.private_ip_denied');
    });

    it('should reject private IP ranges (192.168.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'https://192.168.1.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.private_ip_denied');
    });

    it('should reject private IP ranges (172.16-31.x.x)', async () => {
      const config: WebhookConfig = {
        url: 'https://172.16.0.1/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.private_ip_denied');
    });

    it('should reject URLs that DNS-resolve to private IPs', async () => {
      (lookup as jest.Mock).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);

      const config: WebhookConfig = {
        url: 'https://internal.example.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['task.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.private_ip_denied');
    });
  });

  describe('timeout handling', () => {
    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId: mockTenantId,
      payload: { id: '123' },
      timestamp: new Date().toISOString(),
    };

    it('should handle request timeout with AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValue(abortError);

      const webhook = {
        id: 'webhook-1',
        tenantId: mockTenantId,
        url: 'https://slow-server.com/webhook',
        secret: 'test-secret',
        events: ['booking.created'],
        isActive: true,
        resolvedIps: ['93.184.216.34'],
      } as Webhook;
      qb.getMany.mockResolvedValue([webhook]);

      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');

      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('request_timeout'));
    });

    it('should rethrow non-abort errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const webhook = {
        id: 'webhook-1',
        tenantId: mockTenantId,
        url: 'https://failing-server.com/webhook',
        secret: 'test-secret',
        events: ['booking.created'],
        isActive: true,
        resolvedIps: ['93.184.216.34'],
      } as Webhook;
      qb.getMany.mockResolvedValue([webhook]);

      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');

      await service.emit(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });

    it('should block redirects and log redirect_blocked', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 301,
        statusText: 'Moved Permanently',
        headers: { get: () => 'http://internal.local' },
      } as unknown as Response);

      const webhook = {
        id: 'webhook-1',
        tenantId: mockTenantId,
        url: 'https://redirect-server.com/webhook',
        secret: 'test-secret',
        events: ['booking.created'],
        isActive: true,
        resolvedIps: ['93.184.216.34'],
      } as Webhook;
      qb.getMany.mockResolvedValue([webhook]);

      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');

      await service.emit(event);
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('webhooks.redirect_blocked'));
    });
  });

  describe('webhook signature', () => {
    it('should include timestamp in signature header', async () => {
      const webhook = {
        id: 'webhook-1',
        tenantId: mockTenantId,
        url: 'https://example.com/webhook',
        secret: 'encrypted:test-secret',
        events: ['booking.created'],
        isActive: true,
        resolvedIps: ['93.184.216.34'],
      } as Webhook;
      const event: WebhookEvent = {
        type: 'booking.created',
        tenantId: mockTenantId,
        payload: { id: '123' },
        timestamp: new Date().toISOString(),
      };

      qb.getMany.mockResolvedValue([webhook]);
      await service.emit(event);

      expect(global.fetch).toHaveBeenCalledWith(
        webhook.url,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Timestamp': expect.stringMatching(/^\d+$/),
          }),
        }),
      );
    });
  });

  describe('DNS and Security edge cases', () => {
    it('should handle DNS lookup failure gracefully', async () => {
      (lookup as jest.Mock).mockRejectedValue(new Error('DNS failed'));

      const config: WebhookConfig = {
        url: 'https://does-not-exist.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(config)).rejects.toThrow('webhooks.dns_lookup_failed');
    });

    it('should allow legacy webhooks without allowlisted IPs (re-resolves on send)', async () => {
      (lookup as jest.Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      const webhook = {
        id: 'legacy-1',
        url: 'https://legacy.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
        resolvedIps: undefined, // legacy
        tenantId: mockTenantId,
        isActive: true,
      } as unknown as Webhook;

      // We need to use deliverWebhook to reach check logic or rely on sendWebhookOnce being called
      // emit calls concurrencyLimit -> sendWebhookWithRetry -> sendWebhookOnce
      qb.getMany.mockResolvedValue([webhook]);

      await service.emit({ type: 'booking.created', tenantId: mockTenantId, payload: {}, timestamp: '' });

      // Should resolve DNS again
      expect(lookup).toHaveBeenCalledWith('legacy.com', { all: true });
    });

    it('should block DNS rebinding (IP changed from allowlist)', async () => {
      // Mock lookup to return a NEW IP not in allowlist
      (lookup as jest.Mock).mockResolvedValue([{ address: '1.2.3.4', family: 4 }]);

      const webhook = {
        id: 'rebind-1',
        url: 'https://rebind.com/webhook',
        secret: TEST_SECRETS.WEBHOOK_SECRET,
        events: ['booking.created'],
        resolvedIps: ['9.9.9.9'], // Allowlist has original IP
        tenantId: mockTenantId,
        isActive: true,
      } as unknown as Webhook;

      qb.getMany.mockResolvedValue([webhook]);

      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');

      await service.emit({ type: 'booking.created', tenantId: mockTenantId, payload: {}, timestamp: '' });

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('webhooks.dns_rebinding_blocked'));
    });
  });

  describe('Queue and Retry Logic', () => {
    it('should enqueue job if queue is available', async () => {
      // Re-create service with mock queue
      const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebhookService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: WebhookRepository, useValue: { createQueryBuilder: jest.fn(), findOne: jest.fn() } }, // minimal repo
          { provide: EncryptionService, useValue: mockEncryptionService },
          { provide: 'BullQueue_webhook', useValue: mockQueue }, // Correct BullQueue token
        ],
      }).compile();
      const serviceWithQueue = module.get<WebhookService>(WebhookService);
      const repo = module.get(WebhookRepository);

      const webhook = { id: 'w1', tenantId: 't1', url: 'https://queue.com', events: ['*'], isActive: true } as any;
      const qbWithQueue = { andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([webhook]) };
      (repo.createQueryBuilder as jest.Mock).mockReturnValue(qbWithQueue);

      await serviceWithQueue.emit({
        type: 'booking.created',
        tenantId: 't1',
        payload: {},
        timestamp: '',
      } as WebhookEvent);

      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should retry on failure with backoff', async () => {
      // Force short delay for test
      Object.defineProperty(service, 'INITIAL_RETRY_DELAY', { value: 1 });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) return Promise.reject(new Error('fail'));
        return Promise.resolve({ ok: true, status: 200 } as Response);
      });

      const webhook = {
        id: 'retry-1',
        url: 'https://retry.com',
        secret: 's',
        events: ['*'],
        isActive: true,
        resolvedIps: ['1.1.1.1'],
      } as any;
      (lookup as jest.Mock).mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);

      qb.getMany.mockResolvedValue([webhook]);

      await service.emit({
        type: 'booking.created',
        tenantId: 't1',
        payload: {},
        timestamp: '',
      } as WebhookEvent);

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should give up after max retries', async () => {
      Object.defineProperty(service, 'INITIAL_RETRY_DELAY', { value: 1 });

      global.fetch = jest.fn().mockRejectedValue(new Error('fail forever'));

      const webhook = {
        id: 'fail-1',
        url: 'https://fail.com',
        secret: 's',
        events: ['*'],
        isActive: true,
        resolvedIps: ['1.1.1.1'],
      } as any;
      (lookup as jest.Mock).mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
      qb.getMany.mockResolvedValue([webhook]);

      const loggerErrorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error');

      await service.emit({
        type: 'booking.created',
        tenantId: 't1',
        payload: {},
        timestamp: '',
      } as WebhookEvent);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('attempts'));
    });
  });

  describe('emit edge cases', () => {
    it('should throw if tenantId missing in event', async () => {
      await expect(service.emit({ type: 'booking.created' } as any)).rejects.toThrow('common.tenant_missing');
    });

    it('should skip invalid webhooks (no events)', async () => {
      const webhook = { id: 'w1', events: null, isActive: true } as any;
      qb.getMany.mockResolvedValue([webhook]);

      const loggerWarnSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'warn');

      await service.emit({ type: 'booking.created', tenantId: 't1' } as any);

      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('no events defined'));
    });
  });
});
