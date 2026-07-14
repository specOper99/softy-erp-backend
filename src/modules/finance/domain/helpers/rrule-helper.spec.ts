import { RecurringFrequency } from '../entities/recurring-transaction.entity';
import { nextDateFromRrule, toRruleString } from './rrule-helper';

describe('rrule-helper', () => {
  describe('toRruleString', () => {
    it('maps DAILY 1 to FREQ=DAILY;INTERVAL=1', () => {
      const rule = toRruleString(RecurringFrequency.DAILY, 1, new Date(Date.UTC(2026, 0, 1)));
      expect(rule).toContain('FREQ=DAILY');
      expect(rule).toContain('INTERVAL=1');
    });

    it('maps BIWEEKLY 1 to FREQ=WEEKLY;INTERVAL=2', () => {
      const rule = toRruleString(RecurringFrequency.BIWEEKLY, 1, new Date(Date.UTC(2026, 0, 1)));
      expect(rule).toContain('FREQ=WEEKLY');
      expect(rule).toContain('INTERVAL=2');
    });

    it('maps QUARTERLY 1 to FREQ=MONTHLY;INTERVAL=3', () => {
      const rule = toRruleString(RecurringFrequency.QUARTERLY, 1, new Date(Date.UTC(2026, 0, 1)));
      expect(rule).toContain('FREQ=MONTHLY');
      expect(rule).toContain('INTERVAL=3');
    });

    it('honours user-supplied interval multiplier', () => {
      const rule = toRruleString(RecurringFrequency.MONTHLY, 2, new Date(Date.UTC(2026, 0, 1)));
      expect(rule).toContain('INTERVAL=2');
    });
  });

  describe('nextDateFromRrule', () => {
    it('advances DAILY by 1 day', () => {
      const start = new Date(Date.UTC(2026, 0, 1));
      const rule = toRruleString(RecurringFrequency.DAILY, 1, start);
      const next = nextDateFromRrule(rule, start);
      expect(next?.toISOString().slice(0, 10)).toBe('2026-01-02');
    });

    it('handles month-end safely (Jan 31 monthly → Mar 31, skipping invalid Feb 31)', () => {
      const start = new Date(Date.UTC(2026, 0, 31));
      const rule = toRruleString(RecurringFrequency.MONTHLY, 1, start);
      const next = nextDateFromRrule(rule, start);
      // rrule skips months that do not contain the start day-of-month; the
      // legacy `setMonth(+1)` path overflows to Mar 3 instead. Both behaviours
      // differ from a naive "always last day of the month" expectation —
      // callers must pick one explicitly when migrating.
      expect(next?.toISOString().slice(0, 10)).toBe('2026-03-31');
    });
  });
});
