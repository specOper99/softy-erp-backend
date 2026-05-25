import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { toErrorMessage } from '../../../common/utils/error.util';
import { BookingCreatedEvent } from '../../bookings/events/booking-created.event';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedWebhookHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(BookingCreatedWebhookHandler.name);

  async handle(event: BookingCreatedEvent): Promise<void> {
    this.logger.log(`Handling BookingCreatedEvent for webhooks: ${event.bookingId}`);

    try {
      // TODO: dispatch outbound webhook to registered tenant endpoints
      this.logger.log(`Webhook dispatched for BookingCreatedEvent: ${event.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch webhook for booking ${event.bookingId}: ${toErrorMessage(error)}`);
    }
  }
}
