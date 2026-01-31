import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { WalletBalanceUpdatedEvent } from '../../finance/events/wallet-balance-updated.event';
import { DashboardGateway } from '../dashboard.gateway';

/**
 * WalletBalanceUpdatedHandler (Dashboard Module)
 *
 * Broadcasts real-time wallet balance changes to connected dashboard clients.
 * Enables live updates of staff performance metrics and earnings.
 *
 * Use Cases:
 * - Task completion → update staff earnings display
 * - Commission adjustments → refresh performance dashboards
 * - Payout processing → update available balance indicators
 */
@EventsHandler(WalletBalanceUpdatedEvent)
export class DashboardWalletBalanceHandler implements IEventHandler<WalletBalanceUpdatedEvent> {
  private readonly logger = new Logger(DashboardWalletBalanceHandler.name);

  constructor(private readonly dashboardGateway: DashboardGateway) {}

  async handle(event: WalletBalanceUpdatedEvent): Promise<void> {
    await TenantContextService.run(event.tenantId, async () => {
      try {
        // Broadcast wallet balance changes as REVENUE metric updates
        // MetricsUpdateData accepts any key-value pairs
        const updateData: Record<string, unknown> = {
          userId: event.userId,
          balanceType: event.balanceType,
          oldBalance: event.oldBalance,
          newBalance: event.newBalance,
          delta: event.balanceDelta,
          reason: event.reason,
          relatedTaskId: event.relatedTaskId,
          relatedPayoutId: event.relatedPayoutId,
          timestamp: new Date().toISOString(),
        };

        this.dashboardGateway.broadcastMetricsUpdate(event.tenantId, 'REVENUE', updateData);

        this.logger.debug(
          `Broadcast wallet update to tenant ${event.tenantId}: User ${event.userId} ${event.balanceType} balance changed by $${event.balanceDelta.toFixed(2)}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to broadcast wallet update for user ${event.userId}`,
          error instanceof Error ? error.stack : error,
        );
        // Don't throw - broadcast failure shouldn't block wallet operations
      }
    });
  }
}
