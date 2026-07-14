import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingConfirmedEvent } from '../../bookings/domain/events/booking-confirmed.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(BookingConfirmedEvent)
export class BookingConfirmedWebhookHandler implements IEventHandler<BookingConfirmedEvent> {
  private readonly logger = new Logger(BookingConfirmedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingConfirmedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for BookingConfirmedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'BookingConfirmedEvent', 'booking', event.bookingId, () =>
      this.webhookService.emit({
        type: 'booking.confirmed',
        tenantId: event.tenantId,
        payload: {
          bookingId: event.bookingId,
          clientEmail: event.clientEmail,
          clientName: event.clientName,
          packageName: event.packageName,
          totalPrice: event.totalPrice,
          eventDate: event.eventDate.toISOString(),
        },
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
