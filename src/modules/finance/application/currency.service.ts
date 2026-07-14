import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency } from '../domain/enums/currency.enum';

@Injectable()
export class CurrencyService {
  private readonly mockRates: Record<Currency, number> = {
    [Currency.USD]: 1.0,
    [Currency.EUR]: 0.92,
    [Currency.GBP]: 0.79,
    [Currency.AED]: 3.67,
    [Currency.SAR]: 3.75,
    [Currency.IQD]: 1310,
  };

  getExchangeRate(from: Currency, to: Currency): number {
    if (from === to) return 1.0;
    const rateFrom = this.mockRates[from];
    const rateTo = this.mockRates[to];
    if (!rateFrom || !rateTo) throw new BadRequestException('finance.unsupported_currency');
    return rateTo / rateFrom;
  }

  convert(amount: number, from: Currency, to: Currency): number {
    return amount * this.getExchangeRate(from, to);
  }
}
