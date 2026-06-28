import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PackagePriceChangedEvent } from '../../catalog/events/package-price-changed.event';
import { runWebhookDispatch } from '../../../common/utils/event-dispatch.util';

@EventsHandler(PackagePriceChangedEvent)
export class PackagePriceChangedWebhookHandler implements IEventHandler<PackagePriceChangedEvent> {
  private readonly logger = new Logger(PackagePriceChangedWebhookHandler.name);

  handle(event: PackagePriceChangedEvent): Promise<void> {
    if (!event.requiresNotification) return Promise.resolve();
    return runWebhookDispatch(this.logger, 'PackagePriceChangedEvent', 'package', event.packageId, () => {
      // TODO: dispatch outbound webhook to registered tenant endpoints
    });
  }
}
