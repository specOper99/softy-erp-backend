import type { IEvent } from '@nestjs/cqrs';

/** Separate from BookingUpdatedEvent so financial reconciliation runs only on price/tax changes. */
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

  get priceDelta(): number {
    return this.newTotalPrice - this.oldTotalPrice;
  }

  get requiresReconciliation(): boolean {
    return Math.abs(this.priceDelta) > 0.01;
  }
}
