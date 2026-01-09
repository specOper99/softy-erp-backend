export class MathUtils {
  /**
   * Safe floating point rounding for financial calculations.
   * Uses exponential notation to avoid IEEE 754 precision errors.
   * e.g. round(1.005, 2) -> 1.01 (standard round half up)
   */
  static round(value: number, decimals = 2): number {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  }

  /**
   * Safe addition (a + b) rounded to decimals
   */
  static add(a: number, b: number, decimals = 2): number {
    return this.round(a + b, decimals);
  }

  /**
   * Safe subtraction (a - b) rounded to decimals
   */
  static subtract(a: number, b: number, decimals = 2): number {
    return this.round(a - b, decimals);
  }

  /**
   * Safe multiplication (a * b) rounded to decimals
   */
  static multiply(a: number, b: number, decimals = 2): number {
    return this.round(a * b, decimals);
  }
}
