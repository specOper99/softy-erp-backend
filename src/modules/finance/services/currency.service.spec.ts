import { Test, TestingModule } from '@nestjs/testing';
import { Currency } from '../enums/currency.enum';
import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CurrencyService],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getExchangeRate', () => {
    it('should return 1.0 for same currency', () => {
      expect(service.getExchangeRate(Currency.USD, Currency.USD)).toBe(1.0);
      expect(service.getExchangeRate(Currency.EUR, Currency.EUR)).toBe(1.0);
    });

    it('should return correct rate from USD to EUR', () => {
      const rate = service.getExchangeRate(Currency.USD, Currency.EUR);
      expect(rate).toBeCloseTo(0.92, 2);
    });

    it('should return correct rate from EUR to USD', () => {
      const rate = service.getExchangeRate(Currency.EUR, Currency.USD);
      expect(rate).toBeCloseTo(1.087, 2); // 1/0.92 ≈ 1.087
    });

    it('should return correct rate from USD to AED', () => {
      const rate = service.getExchangeRate(Currency.USD, Currency.AED);
      expect(rate).toBeCloseTo(3.67, 2);
    });

    it('should return correct rate from GBP to EUR', () => {
      const rate = service.getExchangeRate(Currency.GBP, Currency.EUR);
      // EUR rate / GBP rate = 0.92 / 0.79 ≈ 1.165
      expect(rate).toBeCloseTo(1.165, 2);
    });
  });

  describe('convert', () => {
    it('should convert USD to EUR correctly', () => {
      const result = service.convert(100, Currency.USD, Currency.EUR);
      expect(result).toBeCloseTo(92, 0);
    });

    it('should convert EUR to USD correctly', () => {
      const result = service.convert(92, Currency.EUR, Currency.USD);
      expect(result).toBeCloseTo(100, 0);
    });

    it('should return same amount for same currency', () => {
      const result = service.convert(100, Currency.USD, Currency.USD);
      expect(result).toBe(100);
    });

    it('should convert USD to AED correctly', () => {
      const result = service.convert(100, Currency.USD, Currency.AED);
      expect(result).toBeCloseTo(367, 0);
    });

    it('should convert USD to SAR correctly', () => {
      const result = service.convert(100, Currency.USD, Currency.SAR);
      expect(result).toBeCloseTo(375, 0);
    });

    it('should handle zero amount', () => {
      const result = service.convert(0, Currency.USD, Currency.EUR);
      expect(result).toBe(0);
    });

    it('should handle decimal amounts', () => {
      const result = service.convert(99.99, Currency.USD, Currency.EUR);
      expect(result).toBeCloseTo(91.99, 1);
    });
  });
});
