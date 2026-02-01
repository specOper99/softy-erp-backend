import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';
import { WebhookService } from '../webhooks.service';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedWebhookHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(BookingCreatedWebhookHandler.name);

  constructor(private readonly webhookService: WebhookService) {}

  async handle(event: BookingCreatedEvent) {
    this.logger.log(`Handling BookingCreatedEvent for webhook: ${event.bookingId}`);

    await this.webhookService.emit({
      tenantId: event.tenantId,
      type: 'booking.created',
      payload: {
        bookingId: event.bookingId,
        clientEmail: event.clientEmail,
        clientName: event.clientName,
        packageId: event.packageId,
        packageName: event.packageName,
        totalPrice: event.totalPrice,
        assignedUserId: event.assignedUserId,
        eventDate: event.eventDate,
        createdAt: event.createdAt,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
