import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { Booking } from './booking.entity';

describe('Booking.derivePaymentStatus', () => {
  function createBookingForPayment(overrides: Partial<Booking>): Booking {
    const booking = new Booking();
    booking.amountPaid = 0;
    booking.totalPrice = 1000;
    booking.depositAmount = 200;
    Object.assign(booking, overrides);
    return booking;
  }

  it('should return UNPAID when no payment made', () => {
    const booking = createBookingForPayment({ amountPaid: 0 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.UNPAID);
  });

  it('should return PARTIALLY_PAID when some payment but < deposit', () => {
    const booking = createBookingForPayment({ amountPaid: 100 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.PARTIALLY_PAID);
  });

  it('should return DEPOSIT_PAID when amountPaid >= depositAmount', () => {
    const booking = createBookingForPayment({ amountPaid: 200, depositAmount: 200 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.DEPOSIT_PAID);
  });

  it('should return DEPOSIT_PAID when amountPaid exceeds deposit but < total', () => {
    const booking = createBookingForPayment({ amountPaid: 500, depositAmount: 200 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.DEPOSIT_PAID);
  });

  it('should return FULLY_PAID when amountPaid >= totalPrice', () => {
    const booking = createBookingForPayment({ amountPaid: 1000, totalPrice: 1000 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.FULLY_PAID);
  });

  it('should return FULLY_PAID when amountPaid exceeds totalPrice', () => {
    const booking = createBookingForPayment({ amountPaid: 1500, totalPrice: 1000 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.FULLY_PAID);
  });

  it('should return PARTIALLY_PAID when deposit is 0 and partial payment made', () => {
    const booking = createBookingForPayment({ amountPaid: 100, depositAmount: 0 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.PARTIALLY_PAID);
  });

  it('should return UNPAID when totalPrice is 0 (edge case)', () => {
    const booking = createBookingForPayment({ amountPaid: 0, totalPrice: 0, depositAmount: 0 });
    expect(booking.derivePaymentStatus()).toBe(PaymentStatus.UNPAID);
  });
});
