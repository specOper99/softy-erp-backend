import { IEvent } from '@nestjs/cqrs';

/**
 * WalletBalanceUpdatedEvent
 *
 * Published whenever an employee wallet's balance changes.
 * Allows dependent modules (HR, Dashboard) to react to commission changes.
 *
 * Use Cases:
 * - Invalidate payroll cache when pending commissions change
 * - Update real-time staff performance dashboards
 * - Trigger notifications for significant balance changes
 */
export class WalletBalanceUpdatedEvent implements IEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly oldBalance: number,
    public readonly newBalance: number,
    public readonly balanceType: 'pending' | 'paid',
    public readonly reason: string,
    public readonly relatedTaskId?: string,
    public readonly relatedPayoutId?: string,
  ) {}

  /**
   * Calculate the balance change amount
   */
  get balanceDelta(): number {
    return this.newBalance - this.oldBalance;
  }

  /**
   * Check if change is significant (> $10)
   */
  get isSignificantChange(): boolean {
    return Math.abs(this.balanceDelta) >= 10;
  }
}
