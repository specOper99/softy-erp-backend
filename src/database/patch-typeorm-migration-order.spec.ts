import 'reflect-metadata';
import { extractFullMigrationTimestamp } from './patch-typeorm-migration-order';

describe('patch-typeorm-migration-order', () => {
  it('keeps epoch-style 13-digit migration timestamps intact', () => {
    expect(extractFullMigrationTimestamp('AddNewEntities1767800000000')).toBe(1767800000000);
  });

  it('preserves full 14-digit date-based migration timestamps', () => {
    expect(extractFullMigrationTimestamp('AddRecurringTransactionRruleString20260510000000')).toBe(20260510000000);
  });

  it('sorts date-based migrations after older epoch-style migrations', () => {
    const orderedNames = [
      'AddRecurringTransactionRruleString20260510000000',
      'AddNewEntities1767800000000',
      'AddPgTrgmIlikeIndexes20260504000000',
    ]
      .map((name) => ({ name, timestamp: extractFullMigrationTimestamp(name) }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((migration) => migration.name);

    expect(orderedNames).toEqual([
      'AddNewEntities1767800000000',
      'AddPgTrgmIlikeIndexes20260504000000',
      'AddRecurringTransactionRruleString20260510000000',
    ]);
  });
});
