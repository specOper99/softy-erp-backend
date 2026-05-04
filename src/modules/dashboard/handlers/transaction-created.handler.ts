import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { TransactionCreatedEvent } from '../../finance/events/transaction-created.event';
import { DashboardGateway } from '../dashboard.gateway';
import { toErrorMessage } from '../../../common/utils/error.util';

@EventsHandler(TransactionCreatedEvent)
export class DashboardTransactionCreatedHandler implements IEventHandler<TransactionCreatedEvent> {
  private readonly logger = new Logger(DashboardTransactionCreatedHandler.name);

  constructor(private readonly dashboardGateway: DashboardGateway) {}

  async handle(event: TransactionCreatedEvent): Promise<void> {
    // The TransactionCreatedEvent contract requires listeners to skip reversals
    // to avoid double-counting. A reversal transaction has a non-null reversalOfId.
    if (event.reversalOfId != null) return;

    await TenantContextService.run(event.tenantId, async () => {
      try {
        this.dashboardGateway.broadcastMetricsUpdate(event.tenantId, 'REVENUE', {
          action: 'TRANSACTION_RECORDED',
          amount: event.amount,
          type: event.type,
          transactionId: event.transactionId,
          bookingId: event.bookingId,
          taskId: event.taskId,
          payoutId: event.payoutId,
        });
      } catch (error) {
        const message = toErrorMessage(error);
        this.logger.warn(`Failed to broadcast transaction created event: ${message}`);
      }
    });
  }
}
