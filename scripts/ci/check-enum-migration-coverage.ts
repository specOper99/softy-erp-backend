import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../../src/common/utils/error.util';
import { dataSourceOptions } from '../../src/database/data-source';
import { collectEnumExpectations } from '../../src/database/enum-sync';
import {
  findMissingMigrationEnumLabels,
  loadMigrationSourcesFromDir,
  parseMigrationEnumCorpus,
} from '../../src/database/enum-migration-coverage';

/** Subclass so we can build entity metadata without opening a DB connection. */
class OfflineMetadataDataSource extends DataSource {
  async loadEntityMetadatas(): Promise<void> {
    await this.buildMetadatas();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const dataSource = new OfflineMetadataDataSource(dataSourceOptions);

  try {
    await dataSource.loadEntityMetadatas();
    const expectations = collectEnumExpectations(dataSource.entityMetadatas);
    const migrationsDir = join(process.cwd(), 'src', 'database', 'migrations');
    const corpus = parseMigrationEnumCorpus(loadMigrationSourcesFromDir(migrationsDir));
    const missing = findMissingMigrationEnumLabels(expectations, corpus);

    if (missing.length > 0) {
      const preview =
        missing.length <= 12
          ? missing.join('\n  - ')
          : `${missing.slice(0, 12).join('\n  - ')}\n  - ... and ${missing.length - 12} more`;
      fail(
        `Enum migration coverage failed (${missing.length} gap(s)):\n  - ${preview}\n` +
          'Add a migration with CREATE TYPE / ALTER TYPE ... ADD VALUE IF NOT EXISTS (or TypeORM enum array) before shipping.',
      );
    }

    console.info(`Enum migration coverage passed (${expectations.length} enum column(s) checked).`);
  } catch (error) {
    fail(toErrorMessage(error));
  }
}

main().catch((error) => {
  fail(toErrorMessage(error));
});
