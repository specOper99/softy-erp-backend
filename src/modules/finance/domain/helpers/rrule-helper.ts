import { RRule, type Frequency } from 'rrule';
import { RecurringFrequency } from '../entities/recurring-transaction.entity';

const FREQUENCY_MAP: Record<RecurringFrequency, { freq: Frequency; intervalMultiplier: number }> = {
  [RecurringFrequency.DAILY]: { freq: RRule.DAILY, intervalMultiplier: 1 },
  [RecurringFrequency.WEEKLY]: { freq: RRule.WEEKLY, intervalMultiplier: 1 },
  [RecurringFrequency.BIWEEKLY]: { freq: RRule.WEEKLY, intervalMultiplier: 2 },
  [RecurringFrequency.MONTHLY]: { freq: RRule.MONTHLY, intervalMultiplier: 1 },
  [RecurringFrequency.QUARTERLY]: { freq: RRule.MONTHLY, intervalMultiplier: 3 },
  [RecurringFrequency.YEARLY]: { freq: RRule.YEARLY, intervalMultiplier: 1 },
};

export function toRruleString(frequency: RecurringFrequency, interval: number, dtstart: Date): string {
  const mapping = FREQUENCY_MAP[frequency];
  return new RRule({
    freq: mapping.freq,
    interval: interval * mapping.intervalMultiplier,
    dtstart,
  }).toString();
}

/**
 * Compute the next occurrence after `current` from an RRULE string.
 *
 * Returns null when the rule has no further occurrences (e.g. UNTIL exhausted).
 *
 * Note: rrule's month-end semantics differ from the legacy
 * `RecurringTransaction.calculateNextRunDate()` implementation. For example,
 * starting on Jan 31 with monthly frequency, rrule yields Feb 28/29 while the
 * legacy `setMonth` path lands on Mar 3. Callers cutting over to this helper
 * must run a parallel-shadow window before flipping production behaviour.
 */
export function nextDateFromRrule(rruleString: string, current: Date): Date | null {
  const rule = RRule.fromString(rruleString);
  return rule.after(current, false);
}
