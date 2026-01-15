import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { DataSource } from 'typeorm';

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

  const adminDatabase = process.env.DB_ADMIN_DATABASE || 'postgres';
  const adminDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: adminDatabase,
    entities: [],
    migrations: [],
    logging: false,
  });

  try {
    await adminDataSource.initialize();
    const exists = await adminDataSource.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!exists?.length) {
      await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
    }

    // Connect to test database for extension and reset
    const adminOptions = adminDataSource.options;
    const testDbDataSource = new DataSource({
      ...adminOptions,
      database: databaseName,
    });
    try {
      await testDbDataSource.initialize();

      if (process.env.E2E_DB_RESET === 'true') {
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

  const registeredEntities = migrationDataSource.options.entities.map((entity) =>
    typeof entity === 'function' ? entity.name : entity,
  );
  console.log('E2E Migration DataSource Entities:', registeredEntities);

  try {
    if (!migrationDataSource.isInitialized) {
      await migrationDataSource.initialize();
    }

    if (process.env.E2E_DB_RESET !== 'true') {
      await migrationDataSource.runMigrations();
    }

    // Synchronize schema to ensure all entity columns exist
    await migrationDataSource.synchronize();

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
