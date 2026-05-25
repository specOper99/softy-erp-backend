import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { toErrorMessage } from '../../../common/utils/error.util';
import { BookingUpdatedEvent } from '../../bookings/events/booking-updated.event';

@EventsHandler(BookingUpdatedEvent)
export class BookingUpdatedWebhookHandler implements IEventHandler<BookingUpdatedEvent> {
  private readonly logger = new Logger(BookingUpdatedWebhookHandler.name);

  async handle(event: BookingUpdatedEvent): Promise<void> {
    this.logger.log(`Handling BookingUpdatedEvent for webhooks: ${event.bookingId}`);

    try {
      // TODO: dispatch outbound webhook to registered tenant endpoints
      this.logger.log(`Webhook dispatched for BookingUpdatedEvent: ${event.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch webhook for booking ${event.bookingId}: ${toErrorMessage(error)}`);
    }
  }
}
