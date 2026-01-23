import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WebhookService } from '../webhooks.service';
import { WebhookEvent, WebhookJobData } from '../webhooks.types';
import { WebhookProcessor } from './webhook.processor';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Webhook } from '../entities/webhook.entity';

describe('WebhookProcessor - Tenant Context', () => {
  let processor: WebhookProcessor;
  let webhookService: jest.Mocked<WebhookService>;

  const createMockJob = (tenantId: string): Job<WebhookJobData> => {
    const event: WebhookEvent = {
      type: 'booking.created',
      tenantId,
      payload: { bookingId: 'b-123' },
      timestamp: new Date().toISOString(),
    };

    const webhook: Webhook = {
      id: 'webhook-1',
      tenantId,
      url: 'https://example.com/hook',
      secret: 'secret-key',
      events: ['booking.created'],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Webhook;

    return {
      id: 'job-1',
      data: { webhook, event },
    } as unknown as Job<WebhookJobData>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        {
          provide: WebhookService,
          useValue: {
            deliverWebhook: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
    webhookService = module.get(WebhookService);
  });

  it('should have tenant context available during webhook delivery', async () => {
    const tenantId = 'test-tenant-webhook';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    webhookService.deliverWebhook.mockImplementation((_webhook, _event) => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve();
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
    expect(webhookService.deliverWebhook).toHaveBeenCalled();
  });

  it('should propagate tenant context for different tenant', async () => {
    const tenantId = 'another-tenant-123';
    const job = createMockJob(tenantId);

    let capturedTenantId: string | undefined;
    webhookService.deliverWebhook.mockImplementation(() => {
      capturedTenantId = TenantContextService.getTenantId();
      return Promise.resolve();
    });

    await processor.process(job);

    expect(capturedTenantId).toBe(tenantId);
  });

  it('should rethrow errors while preserving tenant context', async () => {
    const tenantId = 'error-tenant';
    const job = createMockJob(tenantId);

    webhookService.deliverWebhook.mockRejectedValue(new Error('Delivery failed'));

    await expect(processor.process(job)).rejects.toThrow('Delivery failed');
  });
});
