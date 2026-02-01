/**
 * Mock Exchange Rate Provider
 *
 * Provides static exchange rates for testing and development.
 * Should NOT be used in production - use a real provider instead.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Currency } from '../../enums/currency.enum';
import { IExchangeRateService } from './exchange-rate.interface';

@Injectable()
export class MockExchangeRateService implements IExchangeRateService {
  private readonly logger = new Logger(MockExchangeRateService.name);

  /**
   * Static mock rates relative to USD
   * These are approximate rates for testing only
   */
  private readonly mockRates: Record<string, number> = {
    [Currency.USD]: 1.0,
    [Currency.EUR]: 0.92,
    [Currency.GBP]: 0.79,
    [Currency.AED]: 3.67,
    [Currency.SAR]: 3.75,
  };

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1.0;

    const rateFrom = this.mockRates[from];
    const rateTo = this.mockRates[to];

    if (!rateFrom) {
      this.logger.warn(`Unsupported source currency: ${from}, using 1.0`);
      return 1.0;
    }

    if (!rateTo) {
      this.logger.warn(`Unsupported target currency: ${to}, using 1.0`);
      return 1.0;
    }

    // Convert via base currency (USD)
    // Rate = (1 / rateFrom) * rateTo
    return rateTo / rateFrom;
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  async getAllRates(baseCurrency: string): Promise<Record<string, number>> {
    const baseRate = this.mockRates[baseCurrency];
    if (!baseRate) {
      this.logger.warn(`Unsupported base currency: ${baseCurrency}, returning empty rates`);
      return {};
    }

    const rates: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(this.mockRates)) {
      if (currency !== baseCurrency) {
        rates[currency] = rate / baseRate;
      }
    }
    return rates;
  }

  async healthCheck(): Promise<boolean> {
    // Mock service is always healthy
    return true;
  }
}
