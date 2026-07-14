import type { IEvent } from '@nestjs/cqrs';

export class PackagePriceChangedEvent implements IEvent {
  constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly oldPrice: number,
    public readonly newPrice: number,
    public readonly packageName?: string,
  ) {}

  get priceDelta(): number {
    return this.newPrice - this.oldPrice;
  }

  get requiresNotification(): boolean {
    return Math.abs(this.priceDelta) > 0.01;
  }
}
