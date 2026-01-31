import { IEvent } from '@nestjs/cqrs';

/**
 * Event fired when a new service package is created.
 * This event triggers:
 * - Cache invalidation for package lists
 * - Webhook notifications to external systems
 * - Analytics tracking
 */
export class PackageCreatedEvent implements IEvent {
  constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly price: number,
    public readonly duration: number,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
  ) {}
}

/**
 * Event fired when a service package is updated.
 * This event triggers:
 * - Cache invalidation
 * - Webhook notifications with changes
 * - If price changed, special handling for existing bookings
 */
export class PackageUpdatedEvent implements IEvent {
  constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, { old: unknown; new: unknown }>,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Check if the price was changed in this update
   */
  get priceChanged(): boolean {
    return 'price' in this.changes;
  }

  /**
   * Get the price change details if price was updated
   */
  get priceChange(): { old: number; new: number } | null {
    if (!this.priceChanged) return null;
    return this.changes['price'] as { old: number; new: number };
  }
}

/**
 * Event fired when a service package is deleted.
 * This event triggers:
 * - Cache invalidation
 * - Webhook notifications
 * - Validation that no active bookings reference this package
 */
export class PackageDeletedEvent implements IEvent {
  constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly deletedAt: Date,
  ) {}
}

/**
 * Event fired when a package price changes.
 * This is a specialized event for price changes that need special handling.
 * Triggers:
 * - Notification to admins
 * - Potential recalculation of pending bookings
 * - Analytics tracking for pricing trends
 */
export class PackagePriceChangedEvent implements IEvent {
  constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly packageName: string,
    public readonly oldPrice: number,
    public readonly newPrice: number,
    public readonly changedAt: Date,
  ) {}

  get priceIncreased(): boolean {
    return this.newPrice > this.oldPrice;
  }

  get priceDecreased(): boolean {
    return this.newPrice < this.oldPrice;
  }

  get percentageChange(): number {
    if (this.oldPrice === 0) return 100;
    return ((this.newPrice - this.oldPrice) / this.oldPrice) * 100;
  }
}
