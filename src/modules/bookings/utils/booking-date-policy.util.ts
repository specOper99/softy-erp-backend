const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface UtcDayRange {
  dayKey: string;
  dayStart: Date;
  dayEnd: Date;
}

export function parseDateOnlyToUtc(dateOnly: string): Date {
  if (!DATE_ONLY_PATTERN.test(dateOnly)) {
    throw new Error('booking.date_only_expected');
  }

  const [yearStr, monthStr, dayStr] = dateOnly.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('booking.invalid_date');
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('booking.invalid_date');
  }

  return parsed;
}

export function parseCanonicalBookingDateInput(input: string): Date {
  if (DATE_ONLY_PATTERN.test(input)) {
    return parseDateOnlyToUtc(input);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('booking.invalid_date');
  }

  return parsed;
}

export function toUtcDateKey(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

export function toUtcDayRange(input: string | Date): UtcDayRange {
  const date = input instanceof Date ? input : parseCanonicalBookingDateInput(input);
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return {
    dayKey: toUtcDateKey(dayStart),
    dayStart,
    dayEnd,
  };
}
