import Decimal from 'decimal.js';

export class MathUtils {
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
