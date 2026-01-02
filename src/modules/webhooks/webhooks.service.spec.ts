import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockWebhookRepository,
        },
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
});
