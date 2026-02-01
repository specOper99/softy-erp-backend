/**
 * External API Exchange Rate Provider
 *
 * Fetches real-time exchange rates from external APIs with caching,
 * retry logic, and fallback support.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { CacheUtilsService } from '../../../../common/cache/cache-utils.service';
import financeConfig from '../../../../config/finance.config';
import { IExchangeRateService } from './exchange-rate.interface';

/**
 * Response structure from exchange rate APIs
 * (Compatible with exchangeratesapi.io and similar providers)
 */
interface ExchangeRateApiResponse {
  success: boolean;
  timestamp: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

@Injectable()
export class ApiExchangeRateService implements IExchangeRateService {
  private readonly logger = new Logger(ApiExchangeRateService.name);
  private readonly cacheKeyPrefix = 'exchange_rate';

  constructor(
    @Inject(financeConfig.KEY)
    private readonly config: ConfigType<typeof financeConfig>,
    private readonly cacheUtils: CacheUtilsService,
  ) {}

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1.0;

    const cacheKey = `${this.cacheKeyPrefix}:${from}:${to}`;
    const cached = await this.cacheUtils.get<number>(cacheKey);

    if (cached !== undefined) {
      this.logger.debug(`Cache hit for ${from} -> ${to}: ${cached}`);
      return cached;
    }

    try {
      const rates = await this.fetchRates(from);
      const rate = rates[to];

      if (!rate) {
        this.logger.warn(`Currency ${to} not found in API response, using fallback`);
        return this.config.exchangeRate.fallbackRate;
      }

      // Cache the rate
      await this.cacheUtils.set(cacheKey, rate, this.config.exchangeRate.cacheTtlMs);
      return rate;
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rate ${from} -> ${to}`, error);

      if (this.config.exchangeRate.useCacheOnFailure) {
        // Try to get any cached rate, even if expired
        const staleCache = await this.cacheUtils.get<number>(`${cacheKey}:stale`);
        if (staleCache !== undefined) {
          this.logger.warn(`Using stale cached rate for ${from} -> ${to}`);
          return staleCache;
        }
      }

      return this.config.exchangeRate.fallbackRate;
    }
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  async getAllRates(baseCurrency: string): Promise<Record<string, number>> {
    const cacheKey = `${this.cacheKeyPrefix}:all:${baseCurrency}`;
    const cached = await this.cacheUtils.get<Record<string, number>>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const rates = await this.fetchRates(baseCurrency);
      await this.cacheUtils.set(cacheKey, rates, this.config.exchangeRate.cacheTtlMs);
      return rates;
    } catch (error) {
      this.logger.error(`Failed to fetch all rates for ${baseCurrency}`, error);
      return {};
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.fetchRates('USD');
      return true;
    } catch {
      return false;
    }
  }

  private async fetchRates(baseCurrency: string): Promise<Record<string, number>> {
    const { baseUrl, apiKey } = this.config.exchangeRate;
    const url = `${baseUrl}/latest?access_key=${apiKey}&base=${baseCurrency}`;

    const response = await this.fetchWithRetry(url, this.config.retry.maxAttempts);

    if (!response.success) {
      throw new Error('Exchange rate API returned unsuccessful response');
    }

    // Store a stale copy for fallback
    const staleCacheKey = `${this.cacheKeyPrefix}:all:${baseCurrency}:stale`;
    await this.cacheUtils.set(staleCacheKey, response.rates, 7 * 24 * 60 * 60 * 1000); // 7 days

    return response.rates;
  }

  private async fetchWithRetry(url: string, retriesLeft: number): Promise<ExchangeRateApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as ExchangeRateApiResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (retriesLeft > 0) {
        const delay =
          this.config.retry.initialDelayMs *
          Math.pow(this.config.retry.backoffMultiplier, this.config.retry.maxAttempts - retriesLeft);
        await this.sleep(Math.min(delay, this.config.retry.maxDelayMs));
        return this.fetchWithRetry(url, retriesLeft - 1);
      }

      this.logger.error(`Exchange rate API error after retries`, {
        url: url.replace(this.config.exchangeRate.apiKey, '[REDACTED]'),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
