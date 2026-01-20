import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WebhookService } from '../webhooks.service';
import { WebhookEvent } from '../webhooks.types';
import { WebhookProcessor } from './webhook.processor';

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let _webhookService: WebhookService;

  const mockWebhookService = {
    deliverWebhook: jest.fn(),
  };

  const mockJob = {
    id: 'job-1',
    data: {
      webhook: {
        id: 'webhook-1',
        tenantId: 'tenant-1',
        url: 'https://example.com/hook',
        secret: 'secret',
        events: ['booking.created'],
      },
      event: {
        id: 'event-1',
        type: 'booking.created',
        payload: { bookingId: 'b-1' },
        timestamp: new Date().toISOString(),
        tenantId: 'tenant-1',
      } as unknown as WebhookEvent,
    },
  } as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        {
          provide: WebhookService,
          useValue: mockWebhookService,
        },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
    _webhookService = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should process webhook job successfully', async () => {
      mockWebhookService.deliverWebhook.mockResolvedValue(undefined);

      await processor.process(mockJob);

      expect(mockWebhookService.deliverWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'webhook-1',
          url: 'https://example.com/hook',
        }),
        mockJob.data.event,
      );
    });

    it('should throw error if delivery fails', async () => {
      mockWebhookService.deliverWebhook.mockRejectedValue(new Error('Delivery failed'));

      await expect(processor.process(mockJob)).rejects.toThrow('Delivery failed');
    });
  });
});
