import { Test, TestingModule } from '@nestjs/testing';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { WebhookService } from '../webhooks.service';
import { BookingConfirmedWebhookHandler } from './booking-confirmed.handler';

describe('BookingConfirmedWebhookHandler', () => {
  let handler: BookingConfirmedWebhookHandler;
  let webhookService: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmedWebhookHandler,
        {
          provide: WebhookService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingConfirmedWebhookHandler>(BookingConfirmedWebhookHandler);
    webhookService = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should emit booking.confirmed webhook', async () => {
      const event: BookingConfirmedEvent = {
        bookingId: 'booking-123',
        tenantId: 'tenant-123',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        packageName: 'Premium',
        totalPrice: 1000,
        eventDate: new Date('2025-06-15'),
      };

      await handler.handle(event);

      expect(webhookService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          type: 'booking.confirmed',
          payload: expect.objectContaining({
            bookingId: 'booking-123',
            clientEmail: 'john@example.com',
            clientName: 'John Doe',
          }),
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
