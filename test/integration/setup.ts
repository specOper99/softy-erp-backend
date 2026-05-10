import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { normalizeMigrationNamesForTypeOrm } from '../utils/typeorm-migration-name.util';

let postgresContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;

function readExistingDbConfig() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_DATABASE;

  if (!host || !port || !username || password === undefined || !database) {
    throw new Error(
      'INTEGRATION_USE_EXISTING_DB=true requires DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, and DB_DATABASE to be set.',
    );
  }

  return { host, port, username, password, database };
}

export default async function globalSetup() {
  let host: string;
  let port: number;
  let username: string;
  let password: string;
  let database: string;

  if (process.env.INTEGRATION_USE_EXISTING_DB === 'true') {
    console.log('\n🗄️ Using existing PostgreSQL database for integration tests...');
    ({ host, port, username, password, database } = readExistingDbConfig());
  } else {
    console.log('\n🐳 Starting PostgreSQL container for integration tests...');

    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withExposedPorts(5432)
      .start();

    port = postgresContainer.getPort();
    host = postgresContainer.getHost();
    username = 'test_user';
    password = 'test_password';
    database = 'test_db';

    console.log(`✅ PostgreSQL container started on ${host}:${port}`);
  }

  // Store connection details in global for tests to use
  globalThis.__POSTGRES_CONTAINER__ = postgresContainer;
  globalThis.__DB_CONFIG__ = {
    host,
    port,
    username,
    password,
    database,
  };

  // Create DataSource and run migrations
  dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: ['src/**/*.entity.{ts,js}'],
    migrations: ['src/database/migrations/*.{ts,js}'],
    synchronize: false,
  });

  await dataSource.initialize();
  normalizeMigrationNamesForTypeOrm(dataSource.migrations);
  console.log('🔄 Running migrations...');
  await dataSource.runMigrations();
  console.log('✅ Migrations complete');
  console.log('Loaded entities:', dataSource.entityMetadatas.map((m) => m.name).join(', '));
  console.log('\n');

  globalThis.__DATA_SOURCE__ = dataSource;
}
