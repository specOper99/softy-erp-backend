import { TransactionType } from '../enums/transaction-type.enum';

export function allowsNegativeIncomeForRefundOrReversal(input: {
  type: TransactionType;
  category?: string;
  bookingId?: string;
}): boolean {
  if (input.type !== TransactionType.INCOME) {
    return false;
  }

  const hasBookingId = typeof input.bookingId === 'string' && input.bookingId.trim().length > 0;
  const normalizedCategory = typeof input.category === 'string' ? input.category.toLowerCase() : '';
  const hasRefundOrReversalMarker = normalizedCategory.includes('refund') || normalizedCategory.includes('reversal');

  return hasBookingId || hasRefundOrReversalMarker;
}
