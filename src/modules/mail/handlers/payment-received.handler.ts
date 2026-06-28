import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { MailService } from '../mail.service';
import { runMailDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(PaymentRecordedEvent)
export class PaymentReceivedHandler implements IEventHandler<PaymentRecordedEvent> {
  private readonly logger = new Logger(PaymentReceivedHandler.name);

  constructor(private readonly mailService: MailService) {}

  handle(event: PaymentRecordedEvent): Promise<void> {
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
