import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingRescheduledEvent } from '../../bookings/events/booking-rescheduled.event';
import { MailService } from '../mail.service';

@EventsHandler(BookingRescheduledEvent)
export class BookingRescheduledHandler implements IEventHandler<BookingRescheduledEvent> {
  private readonly logger = new Logger(BookingRescheduledHandler.name);

  constructor(private readonly mailService: MailService) {}

  async handle(event: BookingRescheduledEvent) {
    this.logger.log(`Handling BookingRescheduledEvent for booking: ${event.bookingId}`);

    for (const staffEmail of event.staffEmails) {
      try {
        await this.mailService.sendBookingRescheduleNotification({
          employeeEmail: staffEmail,
          employeeName: staffEmail,
          bookingId: event.bookingId,
          eventDate: event.eventDate,
          startTime: event.startTime,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send booking rescheduled email for ${event.bookingId} to ${staffEmail}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
