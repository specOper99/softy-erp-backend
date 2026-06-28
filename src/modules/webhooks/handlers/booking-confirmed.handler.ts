import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedWebhookHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedWebhookHandler.name);

  handle(event: BookingConfirmedEvent): Promise<void> {
    return runWebhookDispatch(this.logger, 'BookingConfirmedEvent', 'booking', event.bookingId, () => {
      // TODO: dispatch outbound webhook to registered tenant endpoints
    });
  }
}
