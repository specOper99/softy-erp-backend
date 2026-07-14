import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingCompletedEvent } from '../../bookings/domain/events/booking-completed.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(BookingCompletedEvent)
export class BookingCompletedWebhookHandler implements IEventHandler<BookingCompletedEvent> {
  private readonly logger = new Logger(BookingCompletedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingCompletedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for BookingCompletedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'BookingCompletedEvent', 'booking', event.bookingId, () =>
      this.webhookService.emit({
        type: 'booking.completed',
        tenantId: event.tenantId,
        payload: {
          bookingId: event.bookingId,
          completedAt: event.completedAt.toISOString(),
        },
        timestamp: event.completedAt.toISOString(),
      }),
    );
  }
}
