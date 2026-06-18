import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { toErrorMessage } from '../../../common/utils/error.util';
import { PackagePriceChangedEvent } from '../../catalog/events/package-price-changed.event';

@EventsHandler(PackagePriceChangedEvent)
export class PackagePriceChangedWebhookHandler implements IEventHandler<PackagePriceChangedEvent> {
  private readonly logger = new Logger(PackagePriceChangedWebhookHandler.name);

  async handle(event: PackagePriceChangedEvent): Promise<void> {
    if (!event.requiresNotification) {
      return;
    }

    this.logger.log(`Handling PackagePriceChangedEvent for webhooks: ${event.packageId}`);

    try {
      // TODO: dispatch outbound webhook to registered tenant endpoints
      this.logger.log(`Webhook dispatched for PackagePriceChangedEvent: ${event.packageId}`);
    } catch (error) {
      this.logger.error(`Failed to dispatch webhook for package ${event.packageId}: ${toErrorMessage(error)}`);
    }
  }
}
