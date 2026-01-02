import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { WebhookService } from '../webhooks.service';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedWebhookHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedWebhookHandler.name);

  constructor(private readonly webhookService: WebhookService) {}

  async handle(event: BookingConfirmedEvent) {
    this.logger.log(
      `Handling BookingConfirmedEvent for webhook: ${event.bookingId}`,
    );

    await this.webhookService.emit({
      tenantId: event.tenantId,
      type: 'booking.confirmed',
      payload: {
        bookingId: event.bookingId,
        clientEmail: event.clientEmail,
        clientName: event.clientName,
        packageName: event.packageName,
        totalPrice: event.totalPrice,
        eventDate: event.eventDate,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
