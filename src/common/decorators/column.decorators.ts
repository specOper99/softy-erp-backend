/**
 * Shared TypeORM column factory utilities to eliminate duplication
 * in entity decimal column definitions across Booking, Invoice, etc.
 *
 * These decorators include value transformers to ensure type safety
 * at the database boundary (PostgreSQL returns decimals as strings).
 */
import { Column, ColumnOptions } from 'typeorm';
import { DecimalTransformer, ExchangeRateTransformer, PercentTransformer } from '../transformers/decimal.transformer';

/**
 * Standard decimal column for monetary amounts (12,2 precision).
 * Includes transformer to convert PostgreSQL decimal strings to numbers.
 *
 * @param name - Database column name (snake_case)
 * @param options - Additional TypeORM column options
 *
 * @example
 * ```typescript
 * @MoneyColumn('total_amount')
 * totalAmount: number;
 * ```
 */
export function MoneyColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: DecimalTransformer,
    ...options,
  });
}

/**
 * Standard decimal column for percentages (5,2 precision).
 * Includes transformer to convert PostgreSQL decimal strings to numbers.
 *
 * @param name - Database column name (snake_case)
 * @param options - Additional TypeORM column options
 *
 * @example
 * ```typescript
 * @PercentColumn('tax_rate')
 * taxRate: number;
 * ```
 */
export function PercentColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: PercentTransformer,
    ...options,
  });
}

/**
 * Standard decimal column for exchange rates (12,6 precision).
 * Higher precision for accurate currency conversions.
 *
 * @param name - Database column name (snake_case)
 * @param options - Additional TypeORM column options
 *
 * @example
 * ```typescript
 * @ExchangeRateColumn('exchange_rate')
 * exchangeRate: number;
 * ```
 */
export function ExchangeRateColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'decimal',
    precision: 12,
    scale: 6,
    default: 1.0,
    transformer: ExchangeRateTransformer,
    ...options,
  });
}

/**
 * Standard varchar column with common defaults
 */
export function VarcharColumn(name: string, length = 255, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'varchar',
    length,
    ...options,
  });
}

/**
 * Standard UUID column for foreign keys
 */
export function UuidColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'uuid',
    ...options,
  });
}

/**
 * Standard JSONB column with empty object/array default
 */
export function JsonbColumn(
  name: string,
  defaultValue: '[]' | '{}' = '{}',
  options?: Partial<ColumnOptions>,
): PropertyDecorator {
  return Column({
    name,
    type: 'jsonb',
    default: defaultValue,
    ...options,
  });
}

/**
 * Standard IP address column (supports IPv4 and IPv6)
 */
export function IpAddressColumn(name = 'ip_address', options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'varchar',
    length: 45,
    ...options,
  });
}

/**
 * Standard user agent column
 */
export function UserAgentColumn(name = 'user_agent', options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'text',
    ...options,
  });
}
