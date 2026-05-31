import type { Migration } from 'typeorm';
import { MigrationExecutor } from 'typeorm';

const PATCH_FLAG = Symbol.for('softy.typeormMigrationTimestampPatch');
const migrationTimestampPattern = /(\d+)$/u;

type PatchableMigrationExecutor = typeof MigrationExecutor & {
  [PATCH_FLAG]?: boolean;
};

type MigrationExecutorPrototype = MigrationExecutor & {
  getMigrations(): Migration[];
};

// TypeORM only parses the last 13 digits of the migration class name, which
// breaks mixed migration schemes where newer migrations use 14-digit date-based
// suffixes (for example 20260510000000). We patch the computed timestamp after
// TypeORM builds the migration list so legacy names remain unchanged.
export function extractFullMigrationTimestamp(migrationName: string): number {
  const match = migrationName.match(migrationTimestampPattern);
  if (!match) {
    throw new Error(
      `${migrationName} migration name is wrong. Migration class name should have a numeric timestamp appended.`,
    );
  }

  const suffix = match[1];
  if (!suffix) {
    throw new Error(`${migrationName} migration timestamp is invalid.`);
  }

  const timestamp = Number.parseInt(suffix, 10);
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error(`${migrationName} migration timestamp is invalid.`);
  }

  return timestamp;
}

export function patchTypeOrmMigrationOrdering(): void {
  const patchableExecutor = MigrationExecutor as PatchableMigrationExecutor;
  if (patchableExecutor[PATCH_FLAG]) {
    return;
  }

  const prototype = MigrationExecutor.prototype as MigrationExecutorPrototype;
  const originalGetMigrations = prototype.getMigrations;

  prototype.getMigrations = function patchedGetMigrations(): Migration[] {
    const migrations = originalGetMigrations.call(this);

    for (const migration of migrations) {
      migration.timestamp = extractFullMigrationTimestamp(migration.name);
    }

    return migrations.sort((a, b) => a.timestamp - b.timestamp);
  };

  patchableExecutor[PATCH_FLAG] = true;
}
