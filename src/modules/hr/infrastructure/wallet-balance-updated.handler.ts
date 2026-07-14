import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { CacheUtilsService } from '../../../common/cache/cache-utils.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { WalletBalanceUpdatedEvent } from '../../finance/domain/events/wallet-balance-updated.event';

/**
 * Invalidates payroll/wallet cache keys when commission balances change.
 */
@EventsHandler(WalletBalanceUpdatedEvent)
export class WalletBalanceUpdatedHandler implements IEventHandler<WalletBalanceUpdatedEvent> {
  private readonly logger = new Logger(WalletBalanceUpdatedHandler.name);

  constructor(private readonly cacheUtils: CacheUtilsService) {}

  async handle(event: WalletBalanceUpdatedEvent): Promise<void> {
    await TenantContextService.run(event.tenantId, async () => {
      try {
        this.logger.debug(
          `Wallet balance updated: User ${event.userId}, ${event.balanceType} balance: $${event.oldBalance.toFixed(2)} → $${event.newBalance.toFixed(2)} (${event.reason})`,
        );

        await Promise.all([
          this.cacheUtils.del(`payroll:employee:${event.userId}`),
          this.cacheUtils.del(`payroll:summary:${event.tenantId}`),
          this.cacheUtils.invalidateByPattern(`payroll:${event.tenantId}:*`),
        ]);

        if (event.isSignificantChange) {
          this.logger.log(
            `Significant wallet change for user ${event.userId}: ${event.balanceDelta > 0 ? '+' : ''}$${event.balanceDelta.toFixed(2)}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to handle wallet balance update for user ${event.userId}`,
          error instanceof Error ? error.stack : error,
        );
        // Don't throw - cache invalidation failure shouldn't block wallet operations
      }
    });
  }
}
