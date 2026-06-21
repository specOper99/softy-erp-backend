import 'dotenv/config';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../../src/common/utils/error.util';
import { dataSourceOptions } from '../../src/database/data-source';
import { assertEnumCompatibility } from '../../src/database/enum-sync';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions);

  try {
    await dataSource.initialize();
    await assertEnumCompatibility(dataSource.entityMetadatas, {
      query: (sql, parameters) => dataSource.query(sql, parameters as unknown[] | undefined) as Promise<unknown[]>,
    });
    console.info('Enum sync check passed.');
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
