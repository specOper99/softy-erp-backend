import { Logger } from '@nestjs/common';
import { EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { BookingPriceChangedEvent } from '../../bookings/events/booking-price-changed.event';
import { TransactionType } from '../enums/transaction-type.enum';
import { FinancialReconciliationFailedEvent } from '../events/financial-reconciliation-failed.event';
import { FinanceService } from '../services/finance.service';

/** Category for price adjustment transactions */
const PRICE_ADJUSTMENT_CATEGORY = 'Booking Price Adjustment';

/**
 * BookingPriceChangedHandler
 *
 * Handles price reconciliation when a booking's price changes after initial creation.
 * Creates adjustment transactions to reflect the price difference in financial records.
 *
 * This ensures financial integrity by:
 * - Recording price increases as additional revenue
 * - Recording price decreases as refunds/adjustments
 * - Maintaining audit trail of all price changes
 * - Emitting failure events for monitoring when reconciliation fails
 */
@EventsHandler(BookingPriceChangedEvent)
export class BookingPriceChangedHandler implements IEventHandler<BookingPriceChangedEvent> {
  private readonly logger = new Logger(BookingPriceChangedHandler.name);

  constructor(
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
  ) {}

  async handle(event: BookingPriceChangedEvent): Promise<void> {
    // Skip if no reconciliation needed
    if (!event.requiresReconciliation) {
      this.logger.debug(`Booking ${event.bookingId}: No price reconciliation needed`);
      return;
    }

    await TenantContextService.run(event.tenantId, async () => {
      try {
        await this.dataSource.transaction(async (manager) => {
          const isIncrease = event.priceDelta > 0;
          const description = this.buildDescription(event, isIncrease);

          await this.financeService.createTransactionWithManager(manager, {
            type: isIncrease ? TransactionType.INCOME : TransactionType.EXPENSE,
            amount: Math.abs(event.priceDelta),
            category: PRICE_ADJUSTMENT_CATEGORY,
            bookingId: event.bookingId,
            description,
            transactionDate: new Date(),
          });

          this.logger.log(
            `Created price adjustment transaction for booking ${event.bookingId}: ${isIncrease ? '+' : '-'}$${Math.abs(event.priceDelta).toFixed(2)}`,
          );
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          `[RECONCILIATION_FAILURE] Failed to reconcile price change for booking ${event.bookingId}. ` +
            `Delta: $${event.priceDelta.toFixed(2)}. Error: ${errorMessage}`,
          errorStack,
        );

        // Emit failure event for monitoring/alerting systems
        // This enables:
        // 1. Prometheus metrics for reconciliation failures
        // 2. Slack/PagerDuty alerts
        // 3. Admin dashboard visibility
        // 4. Automated retry mechanisms
        this.eventBus.publish(
          new FinancialReconciliationFailedEvent(
            event.bookingId,
            event.tenantId,
            event.priceDelta,
            errorMessage,
            new Date(),
          ),
        );

        // Don't throw - price reconciliation failure shouldn't block the booking update
        // But the failure IS now tracked and visible via the event system
      }
    });
  }

  private buildDescription(event: BookingPriceChangedEvent, isIncrease: boolean): string {
    const parts = [
      `Booking price ${isIncrease ? 'increased' : 'decreased'}:`,
      `$${event.oldTotalPrice.toFixed(2)} → $${event.newTotalPrice.toFixed(2)}`,
    ];

    if (event.reason) {
      parts.push(`(${event.reason})`);
    }

    return parts.join(' ');
  }
}
