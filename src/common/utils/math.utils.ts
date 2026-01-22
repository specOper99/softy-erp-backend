import Decimal from 'decimal.js';

/**
 * Safe number parsing bounds for financial calculations.
 * These limits prevent:
 * - Overflow attacks (extremely large values)
 * - Precision loss (values beyond IEEE 754 safe integer range)
 * - Negative value injection where not expected
 */
const MAX_FINANCIAL_VALUE = 1_000_000_000_000; // $1 trillion - reasonable upper bound
const MIN_FINANCIAL_VALUE = -1_000_000_000_000; // Allow negative for expenses/refunds

export class MathUtils {
  /**
   * Safely parse a string to a number with range validation.
   * This prevents:
   * - NaN injection (returns defaultValue)
   * - Infinity values (returns defaultValue)
   * - Values outside safe range (clamped or returns defaultValue)
   *
   * @param value - The string value to parse
   * @param defaultValue - Value to return if parsing fails (default: 0)
   * @param options - Optional configuration for min/max bounds
   * @returns A safe, bounded number
   */
  static safeParseFloat(
    value: string | number | null | undefined,
    defaultValue = 0,
    options?: {
      min?: number;
      max?: number;
      allowNegative?: boolean;
    },
  ): number {
    const { min = MIN_FINANCIAL_VALUE, max = MAX_FINANCIAL_VALUE, allowNegative = true } = options || {};

    // Handle null/undefined/empty
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    // If already a number, validate it
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));

    // Handle NaN
    if (Number.isNaN(numValue)) {
      return defaultValue;
    }

    // Handle Infinity
    if (!Number.isFinite(numValue)) {
      return defaultValue;
    }

    // Apply bounds
    const effectiveMin = allowNegative ? min : Math.max(0, min);

    if (numValue < effectiveMin) {
      return effectiveMin;
    }

    if (numValue > max) {
      return max;
    }

    return numValue;
  }

  /**
   * Parse a financial amount with strict validation.
   * More restrictive than safeParseFloat - returns defaultValue
   * instead of clamping for out-of-range values.
   *
   * @param value - The string value to parse
   * @param defaultValue - Value to return if parsing fails (default: 0)
   * @returns A validated financial amount or defaultValue
   */
  static parseFinancialAmount(value: string | number | null | undefined, defaultValue = 0): number {
    const parsed = this.safeParseFloat(value, NaN);

    if (Number.isNaN(parsed)) {
      return defaultValue;
    }

    // Financial amounts must be within reasonable bounds
    if (parsed < MIN_FINANCIAL_VALUE || parsed > MAX_FINANCIAL_VALUE) {
      return defaultValue;
    }

    // Round to 2 decimal places for currency
    return this.round(parsed, 2);
  }

  /**
   * Safe floating point rounding for financial calculations.
   * Uses decimal.js to avoid IEEE 754 precision errors.
   */
  static round(value: number, precision = 2): number {
    return new Decimal(value).toDecimalPlaces(precision).toNumber();
  }

  /**
   * Safe addition (a + b) rounded to precision
   */
  static add(a: number, b: number, precision = 2): number {
    return new Decimal(a).plus(b).toDecimalPlaces(precision).toNumber();
  }

  /**
   * Safe subtraction (a - b) rounded to precision
   */
  static subtract(a: number, b: number, precision = 2): number {
    return new Decimal(a).minus(b).toDecimalPlaces(precision).toNumber();
  }

  /**
   * Safe multiplication (a * b) rounded to precision
   */
  static multiply(a: number, b: number, precision = 2): number {
    return new Decimal(a).times(b).toDecimalPlaces(precision).toNumber();
  }
}
