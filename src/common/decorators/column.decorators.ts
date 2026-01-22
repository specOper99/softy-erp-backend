/**
 * Shared TypeORM column factory utilities to eliminate duplication
 * in entity decimal column definitions across Booking, Invoice, etc.
 */
import { Column, ColumnOptions } from 'typeorm';

/**
 * Standard decimal column for monetary amounts (12,2 precision)
 */
export function MoneyColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    ...options,
  });
}

/**
 * Standard decimal column for percentages (5,2 precision)
 */
export function PercentColumn(name: string, options?: Partial<ColumnOptions>): PropertyDecorator {
  return Column({
    name,
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
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
