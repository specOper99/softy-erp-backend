import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
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
  process.env.DB_LOGGING = 'false';

  console.log('\n🐳 Starting PostgreSQL container for e2e tests...');

  const postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withExposedPorts(5432)
    .start();

  const host = postgresContainer.getHost();
  const port = postgresContainer.getPort();
  const username = postgresContainer.getUsername();
  const password = postgresContainer.getPassword();
  const database = postgresContainer.getDatabase();

  process.env.DB_HOST = host;
  process.env.DB_PORT = String(port);
  process.env.DB_USERNAME = username;
  process.env.DB_PASSWORD = password;
  process.env.DB_DATABASE = database;

  globalThis.__POSTGRES_CONTAINER__ = postgresContainer;
  globalThis.__DB_CONFIG__ = {
    host,
    port,
    username,
    password,
    database,
  };

  console.log(`✅ PostgreSQL container started on ${host}:${port}`);

  const databaseName = process.env.DB_DATABASE;
  if (!databaseName) {
    throw new Error('DB_DATABASE is required for e2e tests');
  }

  // Safety rail
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to run e2e migrations against non-test database: ${databaseName}.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const migrationDataSource = require('../src/database/data-source').default as DataSource;

  const registeredEntities = (migrationDataSource.options.entities as unknown[]).map((entity) =>
    typeof entity === 'function' ? entity.name : entity,
  );
  console.log('E2E Migration DataSource Entities:', registeredEntities);

  if (!migrationDataSource.isInitialized) {
    await migrationDataSource.initialize();
  }

  globalThis.__DATA_SOURCE__ = migrationDataSource;

  try {
    await migrationDataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await migrationDataSource.synchronize(true);

    // 4. Seed base data
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedTestDatabase } = require('./utils/seed-data');
    await seedTestDatabase(migrationDataSource);

    console.log('E2E Global Setup Complete: Database migrated and seeded.');
  } catch (error) {
    if (globalThis.__DATA_SOURCE__?.isInitialized) {
      await globalThis.__DATA_SOURCE__.destroy();
      globalThis.__DATA_SOURCE__ = undefined;
    }
    if (globalThis.__POSTGRES_CONTAINER__) {
      await globalThis.__POSTGRES_CONTAINER__.stop();
      globalThis.__POSTGRES_CONTAINER__ = undefined;
    }
    throw error;
  }

  console.log('E2E Global Setup Complete: Database ready.');
};
export default jestE2eGlobalSetup;
