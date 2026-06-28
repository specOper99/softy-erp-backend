import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { BookingConfirmedEvent } from '../../bookings/events/booking-confirmed.event';
import { MailService } from '../mail.service';
import { runMailDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedMailHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedMailHandler.name);

  constructor(private readonly mailService: MailService) {}

  handle(event: BookingConfirmedEvent): Promise<void> {
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
