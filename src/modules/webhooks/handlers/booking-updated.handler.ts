import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';
import { WebhookService } from '../webhooks.service';

@EventsHandler(BookingUpdatedEvent)
export class BookingUpdatedWebhookHandler implements IEventHandler<BookingUpdatedEvent> {
  constructor(private readonly webhookService: WebhookService) {}

  async handle(event: BookingUpdatedEvent) {
    await this.webhookService.emit({
      type: 'booking.updated',
      tenantId: event.tenantId,
      payload: {
        bookingId: event.bookingId,
        changes: event.changes,
        updatedAt: event.updatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
