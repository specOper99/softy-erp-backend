import {
  parseCanonicalBookingDateInput,
  parseDateOnlyToUtc,
  toUtcDateKey,
  toUtcDayRange,
} from './booking-date-policy.util';

describe('booking-date-policy util', () => {
  it('parses date-only input to UTC midnight', () => {
    const parsed = parseDateOnlyToUtc('2030-01-15');

    expect(parsed.toISOString()).toBe('2030-01-15T00:00:00.000Z');
    expect(toUtcDateKey(parsed)).toBe('2030-01-15');
  });

  it('parses canonical ISO date-time input', () => {
    const parsed = parseCanonicalBookingDateInput('2030-01-15T12:30:00.000Z');

    expect(parsed.toISOString()).toBe('2030-01-15T12:30:00.000Z');
  });

  it('builds day range boundaries in UTC', () => {
    const range = toUtcDayRange('2030-01-15T23:59:59.000Z');

    expect(range.dayKey).toBe('2030-01-15');
    expect(range.dayStart.toISOString()).toBe('2030-01-15T00:00:00.000Z');
    expect(range.dayEnd.toISOString()).toBe('2030-01-16T00:00:00.000Z');
  });

  it('rejects malformed date-only input', () => {
    expect(() => parseDateOnlyToUtc('15-01-2030')).toThrow('booking.date_only_expected');
  });
});
