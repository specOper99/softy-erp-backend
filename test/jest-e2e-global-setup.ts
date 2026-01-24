import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

const jestE2eGlobalSetup = async () => {
  // 1. Load base .env file
  dotenv.config({ path: path.resolve(__dirname, '../.env') });

  // 2. Load .env.test file with overrides
  dotenv.config({
    path: path.resolve(__dirname, '../.env.test'),
    override: true,
  });

  process.env.NODE_ENV = 'test';
  process.env.CSRF_ENABLED = 'false';

  const databaseName = process.env.DB_DATABASE;
  if (!databaseName) {
    throw new Error('DB_DATABASE is required for e2e tests');
  }

  // Safety rail
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to run e2e migrations against non-test database: ${databaseName}.`);
  }

  const allowDestructive = process.env.E2E_ALLOW_DESTRUCTIVE_DB === 'true';

  const adminDatabase = process.env.DB_ADMIN_DATABASE || 'postgres';
  const adminOptions = {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: adminDatabase,
    entities: [],
    migrations: [],
    logging: false,
  } satisfies PostgresConnectionOptions;
  const adminDataSource = new DataSource(adminOptions);

  try {
    await adminDataSource.initialize();
    const exists = await adminDataSource.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!exists?.length) {
      await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
    }

    // Connect to test database for extension and reset.
    // (Avoid spreading DataSource.options since it is a wide union type.)
    const testDbOptions = {
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: databaseName,
      entities: [],
      migrations: [],
      logging: false,
    } satisfies PostgresConnectionOptions;

    const testDbDataSource = new DataSource(testDbOptions);
    try {
      await testDbDataSource.initialize();

      if (process.env.E2E_DB_RESET === 'true') {
        if (!allowDestructive) {
          throw new Error('Refusing to reset schema without E2E_ALLOW_DESTRUCTIVE_DB=true');
        }
        await testDbDataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
        await testDbDataSource.query('CREATE SCHEMA public');
      }

      await testDbDataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    } finally {
      if (testDbDataSource.isInitialized) {
        await testDbDataSource.destroy();
      }
    }
  } finally {
    if (adminDataSource.isInitialized) {
      await adminDataSource.destroy();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const migrationDataSource = require('../src/database/data-source').default;

  const registeredEntities = (migrationDataSource.options.entities as unknown[]).map((entity) =>
    typeof entity === 'function' ? entity.name : entity,
  );
  console.log('E2E Migration DataSource Entities:', registeredEntities);

  try {
    if (!migrationDataSource.isInitialized) {
      await migrationDataSource.initialize();
    }

    if (process.env.E2E_DB_RESET === 'true') {
      if (!allowDestructive) {
        throw new Error('Refusing to reset schema without E2E_ALLOW_DESTRUCTIVE_DB=true');
      }
      // E2E-only: reset schema from entity metadata for a clean slate.
      await migrationDataSource.synchronize(true);
    } else {
      // If not resetting, apply any pending migrations.
      await migrationDataSource.runMigrations();
    }

    // 4. Seed base data
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedTestDatabase } = require('./utils/seed-data');
    await seedTestDatabase(migrationDataSource);

    console.log('E2E Global Setup Complete: Database migrated and seeded.');
  } finally {
    if (migrationDataSource.isInitialized) {
      await migrationDataSource.destroy();
    }
  }

  console.log('E2E Global Setup Complete: Database migrated.');
};
export default jestE2eGlobalSetup;
