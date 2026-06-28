import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AvailabilityCacheOwnerService } from '../../../common/cache/availability-cache-owner.service';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { runGuardedDispatch } from '../../../common/utils/event-dispatch.util';
import { PackagePriceChangedEvent } from '../events/package-price-changed.event';

@EventsHandler(PackagePriceChangedEvent)
export class PackagePriceChangedHandler implements IEventHandler<PackagePriceChangedEvent> {
  private readonly logger = new Logger(PackagePriceChangedHandler.name);

  constructor(
    private readonly cacheUtils: CacheUtilsService,
    private readonly availabilityCacheOwner: AvailabilityCacheOwnerService,
  ) {}

  async handle(event: PackagePriceChangedEvent): Promise<void> {
    if (!event.requiresNotification) {
      this.logger.debug(`Package ${event.packageId}: No price change notification needed`);
      return;
    }

    await TenantContextService.run(event.tenantId, async () =>
      runGuardedDispatch(
        this.logger,
        { failureMessage: `Failed to process package price change for ${event.packageId}` },
        async () => {
          await this.cacheUtils.del(`catalog:packages:${event.tenantId}`);
          await this.availabilityCacheOwner.delAvailabilityForPackage(event.tenantId, event.packageId);
          this.logger.log(
            `Package ${event.packageId} price changed: $${event.oldPrice.toFixed(2)} → $${event.newPrice.toFixed(2)}`,
          );
        },
      ),
    );
  }
}
