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
}

/**
 * Calculated booking price breakdown.
 */
export interface BookingPriceResult {
  /** Base package price */
  subTotal: number;
  /** Tax rate applied */
  taxRate: number;
  /** Calculated tax amount */
  taxAmount: number;
  /** Total price including tax */
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

    const taxAmount = MathUtils.round(subTotal * (taxRate / 100), 2);
    const totalPrice = MathUtils.round(subTotal + taxAmount, 2);
    const depositAmount = MathUtils.round(totalPrice * (depositPercentage / 100), 2);

    return {
      subTotal,
      taxRate,
      taxAmount,
      totalPrice,
      depositPercentage,
      depositAmount,
    };
  }
}
