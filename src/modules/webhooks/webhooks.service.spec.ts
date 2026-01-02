import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EncryptionService } from '../../common/services/encryption.service';
import { Webhook } from './entities/webhook.entity';
import {
  WebhookConfig,
  WebhookEvent,
  WebhookService,
} from './webhooks.service';

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
      secret: 'test-webhook-secret-placeholder',
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

    it('should persist valid HTTPS webhook URL', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'secret-123',
        events: ['booking.created'],
      };

      mockWebhookRepository.create.mockReturnValue({
        tenantId,
        ...config,
        secret: 'encrypted:secret-123',
      });
      mockWebhookRepository.save.mockResolvedValue({ id: 'webhook-1' });

      await service.registerWebhook(tenantId, config);

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('secret-123');
      expect(mockWebhookRepository.create).toHaveBeenCalledWith({
        tenantId,
        url: config.url,
        secret: 'encrypted:secret-123',
        events: config.events,
      });
      expect(mockWebhookRepository.save).toHaveBeenCalled();
    });

    it('should persist valid HTTP webhook URL', async () => {
      const config: WebhookConfig = {
        url: 'http://localhost:3000/webhook',
        secret: 'secret-123',
        events: ['task.created'],
      };

      mockWebhookRepository.create.mockReturnValue({
        tenantId,
        ...config,
      });
      mockWebhookRepository.save.mockResolvedValue({ id: 'webhook-2' });

      await service.registerWebhook(tenantId, config);

      expect(mockWebhookRepository.save).toHaveBeenCalled();
    });

    it('should reject invalid URL format', async () => {
      const config: WebhookConfig = {
        url: 'not-a-valid-url',
        secret: 'secret-123',
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'Invalid webhook URL',
      );
    });

    it('should reject non-HTTP/HTTPS protocols', async () => {
      const config: WebhookConfig = {
        url: 'ftp://example.com/webhook',
        secret: 'secret-123',
        events: ['booking.created'],
      };

      await expect(service.registerWebhook(tenantId, config)).rejects.toThrow(
        'Invalid webhook URL',
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
});
