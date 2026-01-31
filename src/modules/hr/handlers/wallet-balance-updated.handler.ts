import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { WalletBalanceUpdatedEvent } from '../../finance/events/wallet-balance-updated.event';

/**
 * WalletBalanceUpdatedHandler (HR Module)
 *
 * Handles wallet balance changes to invalidate cached payroll data.
 * When commission balances change, cached payroll calculations may become stale.
 *
 * Use Cases:
 * - Task completion adds commission → invalidate employee earnings cache
 * - Payout processes commission → invalidate pending balance cache
 * - Manual adjustments → invalidate all related caches
 */
@EventsHandler(WalletBalanceUpdatedEvent)
export class WalletBalanceUpdatedHandler implements IEventHandler<WalletBalanceUpdatedEvent> {
  private readonly logger = new Logger(WalletBalanceUpdatedHandler.name);

  async handle(event: WalletBalanceUpdatedEvent): Promise<void> {
    await TenantContextService.run(event.tenantId, async () => {
      try {
        // Log for audit trail
        this.logger.debug(
          `Wallet balance updated: User ${event.userId}, ${event.balanceType} balance: $${event.oldBalance.toFixed(2)} → $${event.newBalance.toFixed(2)} (${event.reason})`,
        );

        // TODO: Implement cache invalidation when caching is added
        // Example:
        // await this.cacheManager.del(`payroll:employee:${event.userId}`);
        // await this.cacheManager.del(`payroll:summary:${event.tenantId}`);

        // Log significant changes
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
