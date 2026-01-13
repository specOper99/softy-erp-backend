import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingCancelledEvent } from '../../bookings/events/booking-cancelled.event';
import { MailService } from '../mail.service';

@EventsHandler(BookingCancelledEvent)
export class BookingCancelledHandler implements IEventHandler<BookingCancelledEvent> {
  private readonly logger = new Logger(BookingCancelledHandler.name);

  constructor(private readonly mailService: MailService) {}

  async handle(event: BookingCancelledEvent) {
    this.logger.log(`Handling BookingCancelledEvent for booking: ${event.bookingId}`);

    try {
      await this.mailService.sendCancellationEmail({
        clientName: event.clientName,
        to: event.clientEmail,
        bookingId: event.bookingId,
        eventDate: event.eventDate,
        cancelledAt: event.cancelledAt,
        daysBeforeEvent: event.daysBeforeEvent,
        cancellationReason: event.cancellationReason,
        amountPaid: event.amountPaid,
        refundAmount: event.refundAmount,
        refundPercentage: event.refundPercentage,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send cancellation email for ${event.bookingId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
