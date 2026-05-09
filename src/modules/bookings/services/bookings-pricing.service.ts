import { BadRequestException, Injectable } from '@nestjs/common';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { BookingPriceInput, BookingPriceResult, BookingPriceCalculator } from '../utils/booking-price.calculator';

@Injectable()
export class BookingsPricingService {
  validate(taxRate: number, depositPercentage: number): void {
    if (taxRate < 0 || taxRate > BUSINESS_CONSTANTS.BOOKING.MAX_TAX_RATE_PERCENT) {
      throw new BadRequestException('booking.invalid_tax_rate');
    }
    if (depositPercentage < 0 || depositPercentage > 100) {
      throw new BadRequestException('booking.invalid_deposit_percentage');
    }
  }

  calculate(input: BookingPriceInput): BookingPriceResult {
    return BookingPriceCalculator.calculate(input);
  }
}
