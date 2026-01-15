import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { DataSource } from 'typeorm';

async function resetTestDb() {
  console.log('Resetting TEST database schema...');

  // Load .env and .env.test override
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  dotenv.config({
    path: path.resolve(__dirname, '../.env.test'),
    override: true,
  });

  const dbName = process.env.DB_DATABASE;

  // Strict Safety Check
  if (!dbName || !/test/i.test(dbName)) {
    console.error(
      `Create Safety check failed: DB_DATABASE "${dbName}" does not contain "test". Aborting to protect production/dev data.`,
    );
    process.exit(1);
  }

  console.log(`Target Database: ${dbName}`);

  // Import dataSource using the standard require to ensure it picks up the env vars we just loaded
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('../src/database/data-source') as {
    default: DataSource;
  };
  const dataSource = dbModule.default;

  try {
    await dataSource.initialize();

    console.log('Dropping schema public...');
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');

    console.log('Creating schema public...');
    await dataSource.query('CREATE SCHEMA public');

    console.log('Restoring extensions...');
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    console.log('✅ Schema reset successfully.');
  } catch (error) {
    console.error('❌ Error resetting schema:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
resetTestDb();
