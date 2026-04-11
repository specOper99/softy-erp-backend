import { MathUtils } from '../../../common/utils/math.utils';

/**
 * Input parameters for booking price calculation.
 */
export interface BookingPriceInput {
  /** Base price from the service package */
  packagePrice: number;
  /** Tax rate as a percentage (0-50) */
  taxRate: number;
  /** Deposit percentage (0-100) */
  depositPercentage: number;
  /** Fixed discount amount (applied before tax; capped at subTotal) */
  discountAmount?: number;
}

/**
 * Calculated booking price breakdown.
 */
export interface BookingPriceResult {
  /** Base package price */
  subTotal: number;
  /** Fixed discount amount applied */
  discountAmount: number;
  /** Tax rate applied */
  taxRate: number;
  /** Calculated tax amount (on discounted base) */
  taxAmount: number;
  /** Total price including tax after discount */
  totalPrice: number;
  /** Deposit percentage */
  depositPercentage: number;
  /** Calculated deposit amount */
  depositAmount: number;
}

/**
 * Centralized booking pricing calculator.
 * Consolidates all price calculation logic for consistency and testability.
 */
export class BookingPriceCalculator {
  /**
   * Calculate full pricing breakdown for a booking.
   *
   * @param input - Pricing input parameters
   * @returns Complete price breakdown
   *
   * @example
   * ```typescript
   * const result = BookingPriceCalculator.calculate({
   *   packagePrice: 1000,
   *   taxRate: 10,
   *   depositPercentage: 25,
   * });
   * // { subTotal: 1000, taxAmount: 100, totalPrice: 1100, depositAmount: 275 }
   * ```
   */
  static calculate(input: BookingPriceInput): BookingPriceResult {
    const subTotal = Number(input.packagePrice);
    const taxRate = input.taxRate ?? 0;
    const depositPercentage = input.depositPercentage ?? 0;

    // Apply fixed discount before tax (capped at subTotal)
    const discountAmount = MathUtils.round(Math.min(input.discountAmount ?? 0, subTotal), 2);
    const discountedBase = MathUtils.round(subTotal - discountAmount, 2);

    const taxAmount = MathUtils.round(discountedBase * (taxRate / 100), 2);
    const totalPrice = MathUtils.round(discountedBase + taxAmount, 2);
    const depositAmount = MathUtils.round(totalPrice * (depositPercentage / 100), 2);

    return {
      subTotal,
      discountAmount,
      taxRate,
      taxAmount,
      totalPrice,
      depositPercentage,
      depositAmount,
    };
  }
}
