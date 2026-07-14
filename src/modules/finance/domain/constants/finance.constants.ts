/**
 * Finance Module Constants
 *
 * Centralizes all magic numbers and configuration values used throughout
 * the finance module. These constants should be used instead of hardcoded
 * values for better maintainability and testability.
 *
 * @example
 * ```typescript
 * import { FINANCE } from '../constants/finance.constants';
 *
 * // Instead of: take: 1000
 * take: FINANCE.BATCH.MAX_BATCH_SIZE
 *
 * // Instead of: 10 * 60 * 1000
 * Date.now() - FINANCE.TIME.TEN_MINUTES_MS
 * ```
 */

/**
 * Time-related constants (in milliseconds)
 */
export const TIME_CONSTANTS = {
  /** One second in milliseconds */
  ONE_SECOND_MS: 1000,
  /** One minute in milliseconds */
  ONE_MINUTE_MS: 60 * 1000,
  /** Five minutes in milliseconds */
  FIVE_MINUTES_MS: 5 * 60 * 1000,
  /** Ten minutes in milliseconds */
  TEN_MINUTES_MS: 10 * 60 * 1000,
  /** One hour in milliseconds */
  ONE_HOUR_MS: 60 * 60 * 1000,
  /** One day in milliseconds */
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  /** One week in milliseconds */
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  /** API timeout in milliseconds */
  API_TIMEOUT_MS: 10 * 1000,
  /** Lock timeout for financial operations */
  LOCK_TIMEOUT_MS: 30 * 1000,
} as const;

/**
 * Batch processing limits
 */
export const BATCH_CONSTANTS = {
  /** Maximum items to process in a single batch */
  MAX_BATCH_SIZE: 100,
  /** Default batch size for recurring transactions */
  DEFAULT_BATCH_SIZE: 100,
  /** Maximum concurrent operations */
  MAX_CONCURRENCY: 10,
  /** Alert limit for consistency checks */
  ALERT_LIMIT: 100,
  /** Page size for cursor pagination */
  DEFAULT_PAGE_SIZE: 50,
} as const;

/**
 * Financial precision and rounding
 */
export const PRECISION_CONSTANTS = {
  /** Decimal places for monetary amounts */
  MONEY_PRECISION: 2,
  /** Decimal places for exchange rates */
  EXCHANGE_RATE_PRECISION: 6,
  /** Decimal places for percentages */
  PERCENT_PRECISION: 4,
  /** Minimum amount threshold for rounding */
  ROUNDING_THRESHOLD: 0.01,
} as const;

/**
 * Payout-related constants
 */
export const PAYOUT_CONSTANTS = {
  /** Minimum payout amount */
  MIN_PAYOUT_AMOUNT: 10,
  /** Maximum single payout amount */
  MAX_PAYOUT_AMOUNT: 100_000,
  /** Default commission percentage */
  DEFAULT_COMMISSION_PERCENT: 2.5,
  /** Commission cap (maximum commission amount) */
  COMMISSION_CAP: 500,
} as const;

/**
 * Invoice-related constants
 */
export const INVOICE_CONSTANTS = {
  /** Days until invoice is overdue */
  DAYS_UNTIL_OVERDUE: 30,
  /** Maximum line items per invoice */
  MAX_LINE_ITEMS: 100,
  /** Invoice number prefix */
  NUMBER_PREFIX: 'INV-',
} as const;

/**
 * Budget-related constants
 */
export const BUDGET_CONSTANTS = {
  /** Period format regex pattern (YYYY-MM) */
  PERIOD_FORMAT_REGEX: /^\d{4}-(0[1-9]|1[0-2])$/,
  /** Minimum period value */
  MIN_PERIOD: '2020-01',
  /** Warning threshold percentage for budget utilization */
  WARNING_THRESHOLD_PERCENT: 80,
  /** Critical threshold percentage for budget utilization */
  CRITICAL_THRESHOLD_PERCENT: 95,
} as const;

/**
 * Reconciliation constants
 */
export const RECONCILIATION_CONSTANTS = {
  /** Maximum discrepancy allowed before alert (in smallest currency unit) */
  MAX_DISCREPANCY_THRESHOLD: 100,
  /** Threshold for auto-correction */
  AUTO_CORRECT_THRESHOLD: 10,
  /** Maximum items to reconcile in one run */
  MAX_RECONCILE_BATCH: 1000,
} as const;

/**
 * Cache key prefixes
 */
export const CACHE_KEYS = {
  /** Exchange rate cache prefix */
  EXCHANGE_RATE: 'exchange_rate',
  /** Idempotency cache prefix */
  IDEMPOTENCY: 'idempotency',
  /** Budget summary cache prefix */
  BUDGET_SUMMARY: 'budget_summary',
  /** Transaction summary cache prefix */
  TRANSACTION_SUMMARY: 'txn_summary',
} as const;

/**
 * Lock keys for distributed operations
 */
export const LOCK_KEYS = {
  /** Prefix for recurring transaction locks */
  RECURRING_TRANSACTION: 'lock:recurring_txn',
  /** Prefix for payout processing locks */
  PAYOUT_PROCESSING: 'lock:payout',
  /** Prefix for reconciliation locks */
  RECONCILIATION: 'lock:reconciliation',
  /** Prefix for budget calculation locks */
  BUDGET_CALCULATION: 'lock:budget',
} as const;

/**
 * Aggregated finance constants
 */
export const FINANCE = {
  TIME: TIME_CONSTANTS,
  BATCH: BATCH_CONSTANTS,
  PRECISION: PRECISION_CONSTANTS,
  PAYOUT: PAYOUT_CONSTANTS,
  INVOICE: INVOICE_CONSTANTS,
  BUDGET: BUDGET_CONSTANTS,
  RECONCILIATION: RECONCILIATION_CONSTANTS,
  CACHE: CACHE_KEYS,
  LOCK: LOCK_KEYS,
} as const;

/**
 * Type helpers for constants
 */
export type TimeConstant = (typeof TIME_CONSTANTS)[keyof typeof TIME_CONSTANTS];
export type BatchConstant = (typeof BATCH_CONSTANTS)[keyof typeof BATCH_CONSTANTS];
export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];
export type LockKey = (typeof LOCK_KEYS)[keyof typeof LOCK_KEYS];
