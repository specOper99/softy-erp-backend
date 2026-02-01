import { IEvent } from '@nestjs/cqrs';

/**
 * BookingPriceChangedEvent
 *
 * Published when a booking's price or tax is modified after creation.
 * Triggers financial reconciliation to adjust existing transactions.
 *
 * This is separate from BookingUpdatedEvent to ensure financial
 * side effects are handled explicitly and not on every update.
 */
export class BookingPriceChangedEvent implements IEvent {
  constructor(
    public readonly bookingId: string,
    public readonly tenantId: string,
    public readonly oldSubTotal: number,
    public readonly newSubTotal: number,
    public readonly oldTaxAmount: number,
    public readonly newTaxAmount: number,
    public readonly oldTotalPrice: number,
    public readonly newTotalPrice: number,
    public readonly reason?: string,
  ) {}

  /**
   * Calculate the total price delta for reconciliation
   */
  get priceDelta(): number {
    return this.newTotalPrice - this.oldTotalPrice;
  }

  /**
   * Check if reconciliation is needed (price actually changed)
   */
  get requiresReconciliation(): boolean {
    return Math.abs(this.priceDelta) > 0.01; // Allow for floating point precision
  }
}
