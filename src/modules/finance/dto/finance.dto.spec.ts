import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from './finance.dto';
import { TransactionType } from '../enums/transaction-type.enum';

describe('CreateTransactionDto', () => {
  const baseDto = {
    type: TransactionType.INCOME,
    amount: 1500,
    transactionDate: '2026-01-01T00:00:00.000Z',
  };

  it('accepts negative income when bookingId is present', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      amount: -1500,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts negative income when category includes refund marker', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      amount: -220,
      category: 'Booking Refund',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects negative income without bookingId or refund/reversal marker', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      amount: -220,
      category: 'Adjustment',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects negative expense amount', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      type: TransactionType.EXPENSE,
      amount: -75,
      category: 'Booking Refund',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects negative payroll amount', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      type: TransactionType.PAYROLL,
      amount: -120,
      category: 'Reversal',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('keeps max 2 decimal places validation', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      amount: 10.123,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });
});
