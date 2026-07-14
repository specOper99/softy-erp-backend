import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runMailDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingCancelledEvent } from '../../bookings/domain/events/booking-cancelled.event';
import { MailService } from '../application/mail.service';

@EventsHandler(BookingCancelledEvent)
export class BookingCancelledHandler implements IEventHandler<BookingCancelledEvent> {
  private readonly logger = new Logger(BookingCancelledHandler.name);

  constructor(
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingCancelledEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS mail for BookingCancelledEvent (durable path on)`);
      return Promise.resolve();
    }

    return runMailDispatch(
      this.logger,
      'Handling BookingCancelledEvent for booking',
      event.bookingId,
      'cancellation email',
      () =>
        this.mailService.sendCancellationEmail({
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
        }),
    );
  }
}
