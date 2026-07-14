import { TransactionType } from '../enums/transaction-type.enum';

export function allowsNegativeIncomeForRefundOrReversal(input: {
  type: TransactionType;
  category?: string;
  bookingId?: string;
}): boolean {
  if (input.type !== TransactionType.INCOME) return false;
  const hasBookingId = typeof input.bookingId === 'string' && input.bookingId.trim().length > 0;
  const category = typeof input.category === 'string' ? input.category.toLowerCase() : '';
  return hasBookingId || category.includes('refund') || category.includes('reversal');
}
