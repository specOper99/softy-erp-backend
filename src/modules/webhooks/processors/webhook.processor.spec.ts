import type { Job } from 'bullmq';
import { RuntimeFailure } from '../../../common/errors/runtime-failure';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import type { WebhookJobData } from '../webhooks.types';
import type { WebhookService } from '../webhooks.service';
import { WebhookProcessor } from './webhook.processor';

describe('WebhookProcessor', () => {
  let webhookService: { deliverWebhook: jest.Mock };
  let processor: WebhookProcessor;

  const jobData: WebhookJobData = {
    webhook: {
      id: 'wh-1',
      tenantId: 'tenant-1',
      url: 'https://example.com/hook',
      secret: 'v2:secret',
      events: ['booking.created'],
    },
    event: {
      type: 'booking.created',
      tenantId: 'tenant-1',
      payload: { bookingId: 'booking-1' },
      timestamp: '2030-01-01T00:00:00.000Z',
    },
  };

  beforeEach(() => {
    webhookService = {
      deliverWebhook: jest.fn().mockResolvedValue(undefined),
    };
    processor = new WebhookProcessor(webhookService as unknown as WebhookService);
    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, callback) => callback());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delivers webhook inside tenant context', async () => {
    await processor.process({ id: 'job-1', data: jobData } as Job<WebhookJobData>);

    expect(TenantContextService.run).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(webhookService.deliverWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wh-1',
        tenantId: 'tenant-1',
        url: 'https://example.com/hook',
      }),
      jobData.event,
    );
  });

  it('uses event tenant id when webhook tenant id is missing', async () => {
    const data: WebhookJobData = {
      ...jobData,
      webhook: { ...jobData.webhook, tenantId: undefined as unknown as string },
    };

    await processor.process({ id: 'job-2', data } as Job<WebhookJobData>);

    expect(TenantContextService.run).toHaveBeenCalledWith('tenant-1', expect.any(Function));
  });

  it('throws when tenant context cannot be resolved', async () => {
    const data: WebhookJobData = {
      webhook: { ...jobData.webhook, tenantId: undefined as unknown as string },
      event: { ...jobData.event, tenantId: undefined as unknown as string },
    };

    await expect(processor.process({ id: 'job-3', data } as Job<WebhookJobData>)).rejects.toThrow(RuntimeFailure);
    expect(webhookService.deliverWebhook).not.toHaveBeenCalled();
  });

  it('rethrows delivery failures so BullMQ can retry', async () => {
    webhookService.deliverWebhook.mockRejectedValueOnce(new Error('network down'));

    await expect(processor.process({ id: 'job-4', data: jobData } as Job<WebhookJobData>)).rejects.toThrow(
      'network down',
    );
  });
});
