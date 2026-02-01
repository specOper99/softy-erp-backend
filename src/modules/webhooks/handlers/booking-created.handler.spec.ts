import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';
import { WebhookService } from '../webhooks.service';
import { BookingCreatedWebhookHandler } from './booking-created.handler';

describe('BookingCreatedWebhookHandler', () => {
  let handler: BookingCreatedWebhookHandler;
  let webhookService: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingCreatedWebhookHandler,
        {
          provide: WebhookService,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<BookingCreatedWebhookHandler>(BookingCreatedWebhookHandler);
    webhookService = module.get<WebhookService>(WebhookService);
  });

  it('should emit booking.created webhook', async () => {
    const event = new BookingCreatedEvent(
      'booking-123',
      'tenant-456',
      'client-789',
      'client@example.com',
      'John Doe',
      'package-001',
      'Premium Package',
      1500,
      null,
      new Date('2026-03-15'),
      new Date('2026-02-01'),
    );

    await handler.handle(event);

    expect(webhookService.emit).toHaveBeenCalledWith({
      tenantId: 'tenant-456',
      type: 'booking.created',
      payload: expect.objectContaining({
        bookingId: 'booking-123',
        clientEmail: 'client@example.com',
        clientName: 'John Doe',
        packageName: 'Premium Package',
        totalPrice: 1500,
      }),
      timestamp: expect.any(String),
    });
  });
});
