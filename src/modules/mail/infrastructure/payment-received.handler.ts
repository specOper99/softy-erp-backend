import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_MAIL_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runMailDispatch } from '../../../common/utils/event-dispatch.util';
import { PaymentRecordedEvent } from '../../bookings/domain/events/payment-recorded.event';
import { MailService } from '../application/mail.service';

@EventsHandler(PaymentRecordedEvent)
export class PaymentReceivedHandler implements IEventHandler<PaymentRecordedEvent> {
  private readonly logger = new Logger(PaymentReceivedHandler.name);

  constructor(
    private readonly mailService: MailService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: PaymentRecordedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_MAIL_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS mail for PaymentRecordedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runMailDispatch(
      this.logger,
      'Handling PaymentRecordedEvent for booking',
      event.bookingId,
      'payment receipt',
      () =>
        this.mailService.sendPaymentReceipt({
          clientName: event.clientName,
          to: event.clientEmail,
          bookingId: event.bookingId,
          eventDate: event.eventDate,
          amount: event.amount,
          paymentMethod: event.paymentMethod,
          reference: event.reference,
          totalPrice: event.totalPrice,
          amountPaid: event.amountPaid,
        }),
    );
  }
}
