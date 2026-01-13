import { Test, TestingModule } from '@nestjs/testing';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';
import { WebhookService } from '../webhooks.service';
import { BookingUpdatedWebhookHandler } from './booking-updated.handler';

describe('BookingUpdatedWebhookHandler', () => {
  let handler: BookingUpdatedWebhookHandler;
  let webhookService: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingUpdatedWebhookHandler,
        {
          provide: WebhookService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingUpdatedWebhookHandler>(BookingUpdatedWebhookHandler);
    webhookService = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should emit booking.updated webhook', async () => {
      const event: BookingUpdatedEvent = {
        bookingId: 'booking-123',
        tenantId: 'tenant-123',
        changes: { status: 'CONFIRMED' },
        updatedAt: new Date('2025-06-15'),
        performedBy: 'user-123',
      };

      await handler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          type: 'booking.updated',
          payload: expect.objectContaining({
            bookingId: 'booking-123',
            changes: { status: 'CONFIRMED' },
            updatedAt: event.updatedAt,
          }),
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
