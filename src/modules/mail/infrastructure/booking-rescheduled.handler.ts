import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { toErrorMessage } from '../../../common/utils/error.util';
import { BookingRescheduledEvent } from '../../bookings/domain/events/booking-rescheduled.event';
import { MailService } from '../application/mail.service';

@EventsHandler(BookingRescheduledEvent)
export class BookingRescheduledHandler implements IEventHandler<BookingRescheduledEvent> {
  private readonly logger = new Logger(BookingRescheduledHandler.name);

  constructor(
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  async handle(event: BookingRescheduledEvent) {
    if (this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS mail for BookingRescheduledEvent (durable path on)`);
      return;
    }

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
          `Failed to send booking rescheduled email for ${event.bookingId} to ${staffEmail}: ${toErrorMessage(error)}`,
        );
      }
    }
  }
}
