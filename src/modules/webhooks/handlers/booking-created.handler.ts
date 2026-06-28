import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedWebhookHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(BookingCreatedWebhookHandler.name);

  handle(event: BookingCreatedEvent): Promise<void> {
    return runWebhookDispatch(this.logger, 'BookingCreatedEvent', 'booking', event.bookingId, () => {
      // TODO: dispatch outbound webhook to registered tenant endpoints
    });
  }
}
