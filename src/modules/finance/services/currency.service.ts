import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Currency } from '../enums/currency.enum';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  // Hardcoded mock rates for demonstration (Base: USD)
  private readonly mockRates: Record<Currency, number> = {
    [Currency.USD]: 1.0,
    [Currency.EUR]: 0.92,
    [Currency.GBP]: 0.79,
    [Currency.AED]: 3.67,
    [Currency.SAR]: 3.75,
  };

  /**
   * Returns the exchange rate from one currency to another.
   * In a real app, this would fetch from an external API (e.g. fixer.io, openexchangerates).
   */
  getExchangeRate(from: Currency, to: Currency): number {
    if (from === to) return 1.0;

    const rateFrom = this.mockRates[from];
    const rateTo = this.mockRates[to];

    if (!rateFrom || !rateTo) {
      // SECURITY: Throw error instead of silently using no conversion
      // Silent 1.0 conversion would cause incorrect financial amounts
      throw new BadRequestException('finance.unsupported_currency');
    }

    // Convert 'from' to base (USD), then base to 'to'
    // Actually, since all rates are relative to USD:
    // toAmount = fromAmount * (rateTo / rateFrom)
    return rateTo / rateFrom;
  }

  /**
   * Converts an amount from one currency to another.
   */
  convert(amount: number, from: Currency, to: Currency): number {
    const rate = this.getExchangeRate(from, to);
    return amount * rate;
  }
}
