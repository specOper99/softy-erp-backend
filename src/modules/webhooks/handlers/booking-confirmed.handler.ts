import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { toErrorMessage } from '../../../common/utils/error.util';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedWebhookHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedWebhookHandler.name);

  async handle(event: BookingConfirmedEvent): Promise<void> {
    this.logger.log(`Handling BookingConfirmedEvent for webhooks: ${event.bookingId}`);

    try {
      // TODO: dispatch outbound webhook to registered tenant endpoints
      this.logger.log(`Webhook dispatched for BookingConfirmedEvent: ${event.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch webhook for booking ${event.bookingId}: ${toErrorMessage(error)}`);
    }
  }
}
