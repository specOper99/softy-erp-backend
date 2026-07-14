import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingUpdatedEvent } from '../../bookings/domain/events/booking-updated.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(BookingUpdatedEvent)
export class BookingUpdatedWebhookHandler implements IEventHandler<BookingUpdatedEvent> {
  private readonly logger = new Logger(BookingUpdatedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingUpdatedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for BookingUpdatedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'BookingUpdatedEvent', 'booking', event.bookingId, () =>
      this.webhookService.emit({
        type: 'booking.updated',
        tenantId: event.tenantId,
        payload: {
          bookingId: event.bookingId,
          changes: event.changes,
          updatedAt: event.updatedAt.toISOString(),
        },
        timestamp: event.updatedAt.toISOString(),
      }),
    );
  }
}
