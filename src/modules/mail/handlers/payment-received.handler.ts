import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentRecordedEvent } from '../../bookings/events/payment-recorded.event';
import { MailService } from '../mail.service';

@EventsHandler(PaymentRecordedEvent)
export class PaymentReceivedHandler implements IEventHandler<PaymentRecordedEvent> {
  private readonly logger = new Logger(PaymentReceivedHandler.name);

  constructor(private readonly mailService: MailService) {}

  async handle(event: PaymentRecordedEvent) {
    this.logger.log(`Handling PaymentRecordedEvent for booking: ${event.bookingId}`);

    try {
      await this.mailService.sendPaymentReceipt({
        clientName: event.clientName,
        to: event.clientEmail,
        bookingId: event.bookingId,
        eventDate: event.eventDate,
        amount: event.amount,
        paymentMethod: event.paymentMethod,
        reference: event.reference,
        totalPrice: event.totalPrice,
        amountPaid: event.amountPaid,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send payment receipt for ${event.bookingId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
