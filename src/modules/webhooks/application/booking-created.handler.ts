import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { BookingCreatedEvent } from '../../bookings/domain/events/booking-created.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(BookingCreatedEvent)
export class BookingCreatedWebhookHandler implements IEventHandler<BookingCreatedEvent> {
  private readonly logger = new Logger(BookingCreatedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: BookingCreatedEvent): Promise<void> {
    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for BookingCreatedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'BookingCreatedEvent', 'booking', event.bookingId, () =>
      this.webhookService.emit({
        type: 'booking.created',
        tenantId: event.tenantId,
        payload: {
          bookingId: event.bookingId,
          clientId: event.clientId,
          clientEmail: event.clientEmail,
          clientName: event.clientName,
          packageId: event.packageId,
          packageName: event.packageName,
          totalPrice: event.totalPrice,
          assignedUserId: event.assignedUserId,
          eventDate: event.eventDate.toISOString(),
          createdAt: event.createdAt.toISOString(),
        },
        timestamp: event.createdAt.toISOString(),
      }),
    );
  }
}
