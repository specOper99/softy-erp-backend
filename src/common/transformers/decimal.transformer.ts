/**
 * DecimalTransformer
 *
 * TypeORM value transformer for decimal columns that ensures type safety
 * at the database boundary. PostgreSQL returns decimal/numeric columns as
 * strings to preserve precision, but our application code expects numbers.
 *
 * This transformer:
 * - Converts database strings to JavaScript numbers on read
 * - Validates values are within safe financial bounds
 * - Handles null/undefined gracefully
 * - Prevents NaN/Infinity from corrupting the database
 *
 * @see https://typeorm.io/entities#column-options - transformer option
 */
import Decimal from 'decimal.js';
import type { ValueTransformer } from 'typeorm';
import { RuntimeFailure } from '../errors/runtime-failure';
import { toErrorMessage } from '../utils/error.util';

/** Maximum safe financial value ($1 trillion) */
const MAX_FINANCIAL_VALUE = 1_000_000_000_000;

/** Minimum safe financial value (allows negatives for refunds) */
const MIN_FINANCIAL_VALUE = -1_000_000_000_000;

/**
 * Transformer for monetary decimal columns (12,2 precision).
 * Converts PostgreSQL decimal strings to JavaScript numbers.
 */
export const DecimalTransformer: ValueTransformer = {
  /**
   * Transform value when writing to database.
   * Validates the value is a safe, finite number.
   */
  to(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    // Validate input is a finite number
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RuntimeFailure(`Invalid decimal value: ${value}. Expected a finite number.`);
    }

    // Validate within safe bounds
    if (value < MIN_FINANCIAL_VALUE || value > MAX_FINANCIAL_VALUE) {
      throw new RuntimeFailure(
        `Decimal value ${value} out of safe range [${MIN_FINANCIAL_VALUE}, ${MAX_FINANCIAL_VALUE}]`,
      );
    }

    // Use Decimal.js for precise string conversion
    return new Decimal(value).toFixed(2);
  },

  /**
   * Transform value when reading from database.
   * Converts PostgreSQL decimal string to JavaScript number.
   */
  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    // If already a number (some drivers do this), validate and return
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new RuntimeFailure(`[DecimalTransformer] Non-finite number read from DB: ${value}`);
      }
      return value;
    }

    // Parse string to number using Decimal.js for precision
    try {
      const decimal = new Decimal(value);
      const num = decimal.toNumber();

      if (!Number.isFinite(num)) {
        throw new RuntimeFailure(`[DecimalTransformer] Parsed decimal is non-finite: ${value}`);
      }

      return num;
    } catch (error) {
      throw new RuntimeFailure(
        `[DecimalTransformer] Failed to parse decimal value "${String(value)}" from DB: ${toErrorMessage(error)}`,
        { cause: error },
      );
    }
  },
};

/**
 * Transformer for percentage decimal columns (5,2 precision).
 * Same as DecimalTransformer but with percentage-specific bounds.
 */
export const PercentTransformer: ValueTransformer = {
  to(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RuntimeFailure(`Invalid percentage value: ${value}. Expected a finite number.`);
    }

    // Percentages typically 0-100, but allow some flexibility (e.g., 150% markup)
    if (value < -1000 || value > 1000) {
      throw new RuntimeFailure(`Percentage value ${value} out of reasonable range [-1000, 1000]`);
    }

    return new Decimal(value).toFixed(2);
  },

  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new RuntimeFailure(`[PercentTransformer] Non-finite number read from DB: ${value}`);
      }
      return value;
    }

    try {
      const decimal = new Decimal(value);
      const num = decimal.toNumber();
      if (!Number.isFinite(num)) {
        throw new RuntimeFailure(`[PercentTransformer] Parsed value is non-finite: ${value}`);
      }
      return num;
    } catch (error) {
      throw new RuntimeFailure(
        `[PercentTransformer] Failed to parse percent value "${String(value)}" from DB: ${toErrorMessage(error)}`,
        { cause: error },
      );
    }
  },
};

/**
 * Transformer for exchange rate columns (12,6 precision).
 * Higher precision needed for currency conversion accuracy.
 */
export const ExchangeRateTransformer: ValueTransformer = {
  to(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RuntimeFailure(`Invalid exchange rate value: ${value}. Expected a finite number.`);
    }

    // Exchange rates should be positive (or 0 as edge case)
    if (value < 0 || value > 1_000_000) {
      throw new RuntimeFailure(`Exchange rate ${value} out of reasonable range [0, 1000000]`);
    }

    return new Decimal(value).toFixed(6);
  },

  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new RuntimeFailure(`[ExchangeRateTransformer] Non-finite number read from DB: ${value}`);
      }
      return value;
    }

    try {
      const decimal = new Decimal(value);
      const num = decimal.toNumber();
      if (!Number.isFinite(num)) {
        throw new RuntimeFailure(`[ExchangeRateTransformer] Parsed value is non-finite: ${value}`);
      }
      return num;
    } catch (error) {
      throw new RuntimeFailure(
        `[ExchangeRateTransformer] Failed to parse exchange rate "${String(value)}" from DB: ${toErrorMessage(error)}`,
        { cause: error },
      );
    }
  },
};
