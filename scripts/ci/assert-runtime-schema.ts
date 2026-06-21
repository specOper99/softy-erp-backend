import 'dotenv/config';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../../src/common/utils/error.util';
import { dataSourceOptions } from '../../src/database/data-source';
import { assertEnumCompatibility } from '../../src/database/enum-sync';
import { assertRuntimeSchemaCompatibility } from '../../src/database/runtime-schema-validation';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions);

  try {
    await dataSource.initialize();
    await assertRuntimeSchemaCompatibility(dataSource);
    const masterQueryRunner = dataSource.createQueryRunner('master');
    try {
      await masterQueryRunner.connect();
      await assertEnumCompatibility(dataSource.entityMetadatas, {
        query: (sql, parameters) =>
          masterQueryRunner.query(sql, parameters as unknown[] | undefined) as Promise<unknown[]>,
      });
    } finally {
      await masterQueryRunner.release();
    }
    console.info('Runtime schema and enum compatibility checks passed.');
  } catch (error) {
    fail(toErrorMessage(error));
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((error) => {
  fail(toErrorMessage(error));
});
