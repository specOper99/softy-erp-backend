import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(BookingUpdatedEvent)
export class BookingUpdatedWebhookHandler implements IEventHandler<BookingUpdatedEvent> {
  private readonly logger = new Logger(BookingUpdatedWebhookHandler.name);

  handle(event: BookingUpdatedEvent): Promise<void> {
    return runWebhookDispatch(this.logger, 'BookingUpdatedEvent', 'booking', event.bookingId, () => {
      // TODO: dispatch outbound webhook to registered tenant endpoints
    });
  }
}
