import type { DataSource } from 'typeorm';

const migrationNameOverrides: Record<string, string> = {
  EnforceGlobalUniqueUserEmail20260125000000: 'EnforceGlobalUniqueUserEmail2026012500000',
  AddBookingStatusConstraints1738108524000: 'AddBookingStatusConstraints1768000000100',
};

export function normalizeMigrationNamesForTypeOrm(migrations: DataSource['migrations']): void {
  for (const migration of migrations) {
    const rawName = migration.name || migration.constructor.name;

    const overrideName = migrationNameOverrides[rawName];
    if (overrideName) {
      migration.name = overrideName;
      continue;
    }

    const parts = rawName.match(/^(.*?)(\d+)$/);
    if (!parts) {
      continue;
    }

    const [, baseName, numericSuffix] = parts;
    if (numericSuffix.length <= 13) {
      continue;
    }

    migration.name = `${baseName}${numericSuffix.slice(0, 13)}`;
  }
}
