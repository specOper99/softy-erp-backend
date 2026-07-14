import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runMailDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingConfirmedEvent } from '../../bookings/domain/events/booking-confirmed.event';
import { MailService } from '../application/mail.service';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedMailHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedMailHandler.name);

  constructor(
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingConfirmedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS mail for BookingConfirmedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runMailDispatch(
      this.logger,
      'Handling BookingConfirmedEvent for mail',
      event.bookingId,
      'booking confirmation email',
      () =>
        this.mailService.sendBookingConfirmation({
          clientName: event.clientName,
          clientEmail: event.clientEmail,
          eventDate: event.eventDate,
          packageName: event.packageName,
          totalPrice: event.totalPrice,
          bookingId: event.bookingId,
        }),
    );
  }
}
