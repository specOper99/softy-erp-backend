import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TransactionType } from '../enums/transaction-type.enum';
import { CreateTransactionDto } from './finance.dto';

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

  // ─── XOR parent-ID validator (F9 / AtMostOneParentIdConstraint) ───────────

  it('accepts DTO with none of bookingId / taskId / payoutId (zero-parent)', async () => {
    const dto = plainToInstance(CreateTransactionDto, { ...baseDto });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'bookingId')).toHaveLength(0);
  });

  it('accepts DTO with only bookingId set', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'bookingId')).toHaveLength(0);
  });

  it('accepts DTO with only taskId set', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      taskId: 'a1b2c3d4-0000-0000-0000-000000000001',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'bookingId')).toHaveLength(0);
  });

  it('accepts DTO with only payoutId set', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      payoutId: 'a1b2c3d4-0000-0000-0000-000000000002',
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'bookingId')).toHaveLength(0);
  });

  it('rejects DTO with both bookingId and taskId (two parents)', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
      taskId: 'a1b2c3d4-0000-0000-0000-000000000001',
    });
    const errors = await validate(dto);
    // The constraint is attached to bookingId
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });

  it('rejects DTO with both bookingId and payoutId', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
      payoutId: 'a1b2c3d4-0000-0000-0000-000000000002',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });

  it('rejects DTO with both taskId and payoutId', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      taskId: 'a1b2c3d4-0000-0000-0000-000000000001',
      payoutId: 'a1b2c3d4-0000-0000-0000-000000000002',
    });
    const errors = await validate(dto);
    // validator is on all three fields; when bookingId absent, error appears on taskId or payoutId
    expect(errors.some((e) => e.property === 'taskId' || e.property === 'payoutId')).toBe(true);
  });

  it('rejects DTO with all three parent IDs set', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
      taskId: 'a1b2c3d4-0000-0000-0000-000000000001',
      payoutId: 'a1b2c3d4-0000-0000-0000-000000000002',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bookingId')).toBe(true);
  });

  it('validation error for two-parent DTO names the conflicting property', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      ...baseDto,
      bookingId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
      taskId: 'a1b2c3d4-0000-0000-0000-000000000001',
    });
    const errors = await validate(dto);
    const xorError = errors.find((e) => e.property === 'bookingId');
    expect(xorError).toBeDefined();
    const messages = Object.values(xorError!.constraints ?? {});
    expect(messages.some((m) => /bookingId|taskId|payoutId/i.test(m))).toBe(true);
  });
});
