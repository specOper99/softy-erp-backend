import { normalizeMigrationNamesForTypeOrm } from './typeorm-migration-name.util';

describe('normalizeMigrationNamesForTypeOrm', () => {
  it('applies explicit overrides for known migration name mismatches', () => {
    const migrations = [{ name: 'EnforceGlobalUniqueUserEmail20260125000000' }];

    normalizeMigrationNamesForTypeOrm(migrations as never);

    expect(migrations[0]?.name).toBe('EnforceGlobalUniqueUserEmail2026012500000');
  });

  it('trims overlong numeric suffixes to the length TypeORM expects', () => {
    const migrations = [{ name: 'SampleMigration12345678901234' }];

    normalizeMigrationNamesForTypeOrm(migrations as never);

    expect(migrations[0]?.name).toBe('SampleMigration1234567890123');
  });
});
