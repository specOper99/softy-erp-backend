/**
 * Finance Configuration
 *
 * Centralizes all financial configuration settings including:
 * - Exchange rate provider settings
 * - Batch processing limits
 * - Retry policies
 * - Currency precision settings
 *
 * @example
 * ```typescript
 * // Inject in service
 * constructor(
 *   @Inject(financeConfig.KEY)
 *   private readonly config: ConfigType<typeof financeConfig>,
 * ) {}
 *
 * // Access values
 * const { maxBatchSize } = this.config.processing;
 * const { provider } = this.config.exchangeRate;
 * ```
 */
import { registerAs } from '@nestjs/config';

/**
 * Supported exchange rate providers
 */
export type ExchangeRateProvider = 'openexchangerates' | 'fixer' | 'exchangeratesapi' | 'mock';

/**
 * Finance configuration structure
 */
export interface FinanceConfig {
  /** Exchange rate configuration */
  exchangeRate: {
    /** Active provider for exchange rates */
    provider: ExchangeRateProvider;
    /** API key for the exchange rate provider */
    apiKey: string;
    /** Base URL for the exchange rate API */
    baseUrl: string;
    /** Cache TTL for exchange rates in milliseconds (default: 1 hour) */
    cacheTtlMs: number;
    /** Fallback exchange rate if API fails */
    fallbackRate: number;
    /** Whether to use cached rates on API failure */
    useCacheOnFailure: boolean;
  };

  /** Batch processing configuration */
  processing: {
    /** Maximum items to process in a single batch */
    maxBatchSize: number;
    /** Concurrency limit for parallel operations */
    concurrencyLimit: number;
    /** Timeout for batch operations in milliseconds */
    batchTimeoutMs: number;
  };

  /** Retry policy configuration */
  retry: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Initial delay between retries in milliseconds */
    initialDelayMs: number;
    /** Maximum delay between retries in milliseconds */
    maxDelayMs: number;
    /** Exponential backoff multiplier */
    backoffMultiplier: number;
  };

  /** Currency and precision settings */
  currency: {
    /** Default currency code (ISO 4217) */
    defaultCode: string;
    /** Decimal precision for monetary amounts */
    moneyPrecision: number;
    /** Decimal precision for exchange rates */
    exchangeRatePrecision: number;
    /** Decimal precision for percentages */
    percentPrecision: number;
    /** Rounding mode: 'half-up' | 'half-down' | 'banker' */
    roundingMode: 'half-up' | 'half-down' | 'banker';
  };

  /** Reconciliation settings */
  reconciliation: {
    /** Maximum allowed discrepancy before alert (in smallest currency unit) */
    maxDiscrepancyThreshold: number;
    /** Whether to auto-correct minor discrepancies */
    autoCorrectMinorDiscrepancies: boolean;
    /** Threshold below which auto-correction is allowed */
    autoCorrectThreshold: number;
  };

  /** Payout configuration */
  payout: {
    /** Minimum payout amount */
    minimumAmount: number;
    /** Maximum single payout amount */
    maximumAmount: number;
    /** Default commission percentage */
    defaultCommissionPercent: number;
    /** Commission cap (maximum commission amount) */
    commissionCap: number;
  };
}

/**
 * Parse exchange rate provider from environment
 */
function parseProvider(value: string | undefined): ExchangeRateProvider {
  const validProviders: ExchangeRateProvider[] = ['openexchangerates', 'fixer', 'exchangeratesapi', 'mock'];
  const provider = (value?.toLowerCase() || 'mock') as ExchangeRateProvider;
  return validProviders.includes(provider) ? provider : 'mock';
}

/**
 * Parse rounding mode from environment
 */
function parseRoundingMode(value: string | undefined): 'half-up' | 'half-down' | 'banker' {
  const validModes = ['half-up', 'half-down', 'banker'] as const;
  const mode = value?.toLowerCase() as (typeof validModes)[number];
  return validModes.includes(mode) ? mode : 'half-up';
}

export default registerAs('finance', (): FinanceConfig => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    exchangeRate: {
      provider: parseProvider(process.env.EXCHANGE_RATE_PROVIDER),
      apiKey: process.env.EXCHANGE_RATE_API_KEY || '',
      baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://api.exchangeratesapi.io/v1',
      cacheTtlMs: parseInt(process.env.EXCHANGE_RATE_CACHE_TTL_MS || '3600000', 10), // 1 hour
      fallbackRate: parseFloat(process.env.EXCHANGE_RATE_FALLBACK || '1.0'),
      useCacheOnFailure: process.env.EXCHANGE_RATE_USE_CACHE_ON_FAILURE !== 'false',
    },

    processing: {
      maxBatchSize: parseInt(process.env.FINANCE_MAX_BATCH_SIZE || (isProd ? '100' : '50'), 10),
      concurrencyLimit: parseInt(process.env.FINANCE_CONCURRENCY_LIMIT || '10', 10),
      batchTimeoutMs: parseInt(process.env.FINANCE_BATCH_TIMEOUT_MS || '300000', 10), // 5 minutes
    },

    retry: {
      maxAttempts: parseInt(process.env.FINANCE_RETRY_MAX_ATTEMPTS || '3', 10),
      initialDelayMs: parseInt(process.env.FINANCE_RETRY_INITIAL_DELAY_MS || '1000', 10),
      maxDelayMs: parseInt(process.env.FINANCE_RETRY_MAX_DELAY_MS || '30000', 10),
      backoffMultiplier: parseFloat(process.env.FINANCE_RETRY_BACKOFF_MULTIPLIER || '2'),
    },

    currency: {
      defaultCode: process.env.DEFAULT_CURRENCY || 'SAR',
      moneyPrecision: parseInt(process.env.MONEY_PRECISION || '2', 10),
      exchangeRatePrecision: parseInt(process.env.EXCHANGE_RATE_PRECISION || '6', 10),
      percentPrecision: parseInt(process.env.PERCENT_PRECISION || '4', 10),
      roundingMode: parseRoundingMode(process.env.MONEY_ROUNDING_MODE),
    },

    reconciliation: {
      maxDiscrepancyThreshold: parseInt(process.env.RECONCILIATION_MAX_DISCREPANCY || '100', 10), // 1.00 in currency
      autoCorrectMinorDiscrepancies: process.env.RECONCILIATION_AUTO_CORRECT !== 'false',
      autoCorrectThreshold: parseInt(process.env.RECONCILIATION_AUTO_CORRECT_THRESHOLD || '10', 10), // 0.10
    },

    payout: {
      minimumAmount: parseFloat(process.env.PAYOUT_MINIMUM_AMOUNT || '10'),
      maximumAmount: parseFloat(process.env.PAYOUT_MAXIMUM_AMOUNT || '100000'),
      defaultCommissionPercent: parseFloat(process.env.PAYOUT_DEFAULT_COMMISSION_PERCENT || '2.5'),
      commissionCap: parseFloat(process.env.PAYOUT_COMMISSION_CAP || '500'),
    },
  };
});
