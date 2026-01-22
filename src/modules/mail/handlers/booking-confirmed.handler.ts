import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { MailService } from '../mail.service';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedMailHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedMailHandler.name);

  constructor(private readonly mailService: MailService) {}

  async handle(event: BookingConfirmedEvent) {
    this.logger.log(`Handling BookingConfirmedEvent for mail: ${event.bookingId}`);

    try {
      await this.mailService.sendBookingConfirmation({
        clientName: event.clientName,
        clientEmail: event.clientEmail,
        eventDate: event.eventDate,
        packageName: event.packageName,
        totalPrice: event.totalPrice,
        bookingId: event.bookingId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send booking confirmation email for ${event.bookingId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
