/**
 * Exchange Rate Service Interface
 *
 * Defines the contract for exchange rate providers. Implementations can fetch
 * rates from various sources (APIs, databases, mock data).
 *
 * @example
 * ```typescript
 * // In a service
 * const rate = await this.exchangeRateService.getRate('USD', 'EUR');
 * const converted = await this.exchangeRateService.convert(100, 'USD', 'EUR');
 * ```
 */
export interface IExchangeRateService {
  /**
   * Get the exchange rate between two currencies
   * @param from Source currency code (ISO 4217)
   * @param to Target currency code (ISO 4217)
   * @returns Exchange rate (multiply source amount by this to get target amount)
   */
  getRate(from: string, to: string): Promise<number>;

  /**
   * Convert an amount from one currency to another
   * @param amount Amount to convert
   * @param from Source currency code (ISO 4217)
   * @param to Target currency code (ISO 4217)
   * @returns Converted amount
   */
  convert(amount: number, from: string, to: string): Promise<number>;

  /**
   * Get all available exchange rates for a base currency
   * @param baseCurrency Base currency code
   * @returns Map of currency codes to rates
   */
  getAllRates(baseCurrency: string): Promise<Record<string, number>>;

  /**
   * Check if the service is healthy and can fetch rates
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Injection token for exchange rate service
 */
export const EXCHANGE_RATE_SERVICE = Symbol('EXCHANGE_RATE_SERVICE');
