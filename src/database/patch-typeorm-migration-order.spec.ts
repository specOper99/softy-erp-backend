import 'reflect-metadata';
import { extractFullMigrationTimestamp, getEffectiveMigrationTimestamp } from './patch-typeorm-migration-order';

describe('patch-typeorm-migration-order', () => {
  it('keeps epoch-style 13-digit migration timestamps intact', () => {
    expect(extractFullMigrationTimestamp('AddNewEntities1767800000000')).toBe(1767800000000);
  });

  it('preserves full 14-digit date-based migration timestamps', () => {
    expect(extractFullMigrationTimestamp('AddRecurringTransactionRruleString20260510000000')).toBe(20260510000000);
  });

  it('overrides historical timestamps when the raw suffix does not reflect dependencies', () => {
    expect(getEffectiveMigrationTimestamp('AddBookingStatusConstraints1738108524000')).toBe(1768000000100);
    expect(getEffectiveMigrationTimestamp('AddPhone2ToClients1744243201000')).toBe(1767272597300);
    expect(getEffectiveMigrationTimestamp('RenameAccessTokenToHash1736469350000')).toBe(1767272597301);
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

  it('sorts booking status constraints after the missing booking columns migration', () => {
    const orderedNames = ['AddBookingStatusConstraints1738108524000', 'AddMissingBookingColumns1768000000001']
      .map((name) => ({ name, timestamp: getEffectiveMigrationTimestamp(name) }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((migration) => migration.name);

    expect(orderedNames).toEqual(['AddMissingBookingColumns1768000000001', 'AddBookingStatusConstraints1738108524000']);
  });

  it('sorts AddPhone2ToClients after the clients table is created', () => {
    const orderedNames = ['AddPhone2ToClients1744243201000', 'RefactorTransactionsAndAddClients1767272597291']
      .map((name) => ({ name, timestamp: getEffectiveMigrationTimestamp(name) }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((migration) => migration.name);

    expect(orderedNames).toEqual(['RefactorTransactionsAndAddClients1767272597291', 'AddPhone2ToClients1744243201000']);
  });

  it('sorts RenameAccessTokenToHash after the clients table is created', () => {
    const orderedNames = ['RenameAccessTokenToHash1736469350000', 'RefactorTransactionsAndAddClients1767272597291']
      .map((name) => ({ name, timestamp: getEffectiveMigrationTimestamp(name) }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((migration) => migration.name);

    expect(orderedNames).toEqual([
      'RefactorTransactionsAndAddClients1767272597291',
      'RenameAccessTokenToHash1736469350000',
    ]);
  });
});
