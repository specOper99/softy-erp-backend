import { Logger, Optional } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DURABLE_WEBHOOK_EVENTS_FLAG } from '../../../common/events/outbox-envelope';
import { FlagsService } from '../../../common/flags/flags.service';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';
import { PackagePriceChangedEvent } from '../../catalog/domain/events/package-price-changed.event';
import { WebhookService } from './webhooks.service';

@EventsHandler(PackagePriceChangedEvent)
export class PackagePriceChangedWebhookHandler implements IEventHandler<PackagePriceChangedEvent> {
  private readonly logger = new Logger(PackagePriceChangedWebhookHandler.name);

  constructor(
    private readonly webhookService: WebhookService,
    @Optional() private readonly flagsService?: FlagsService,
  ) {}

  handle(event: PackagePriceChangedEvent): Promise<void> {
    if (!event.requiresNotification) return Promise.resolve();

    if (this.flagsService?.isEnabled(DURABLE_WEBHOOK_EVENTS_FLAG, {}, true) ?? true) {
      this.logger.debug(`Skipping legacy CQRS webhook for PackagePriceChangedEvent (durable path on)`);
      return Promise.resolve();
    }

    return runWebhookDispatch(this.logger, 'PackagePriceChangedEvent', 'package', event.packageId, () =>
      this.webhookService.emit({
        type: 'package.price_changed',
        tenantId: event.tenantId,
        payload: {
          packageId: event.packageId,
          packageName: event.packageName,
          oldPrice: event.oldPrice,
          newPrice: event.newPrice,
          priceDelta: event.priceDelta,
        },
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
