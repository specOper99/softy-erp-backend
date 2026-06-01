import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../../src/common/utils/error.util';
import { patchTypeOrmMigrationOrdering } from '../../src/database/patch-typeorm-migration-order';

/**
 * TypeORM 0.3.x + pg@8.12+ emit a "Calling client.query() when the client is
 * already executing a query" DeprecationWarning when running DDL-heavy
 * migrations. The underlying call order is safe — TypeORM queues correctly —
 * but pg@8 warns preemptively. Override process.emitWarning (the emission
 * point, before Node's default stderr handler runs) to filter only this
 * known-safe deprecation and keep CI output readable.
 */
const _originalEmitWarning = process.emitWarning.bind(process);
// @ts-expect-error — overriding built-in with compatible signature
process.emitWarning = (warning: string | Error, ...args: Parameters<typeof process.emitWarning>) => {
  const message = typeof warning === 'string' ? warning : (warning?.message ?? '');
  if (message.includes('client.query()') && message.includes('already executing a query')) {
    return; // suppress TypeORM/pg@8 migration DDL queue warning
  }
  return _originalEmitWarning(warning, ...(args as []));
};

let postgresContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;

patchTypeOrmMigrationOrdering();

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

function formatContainerRuntimeError(error: unknown): Error {
  const reason = toErrorMessage(error);

  return new Error(
    'Integration tests require either a working container runtime for testcontainers ' +
      'or an explicitly configured existing PostgreSQL database. ' +
      'Start Docker/Colima/Podman, or rerun with INTEGRATION_USE_EXISTING_DB=true ' +
      'and DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE set. ' +
      `Original error: ${reason}`,
  );
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

    try {
      postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .withExposedPorts(5432)
        .start();
    } catch (error) {
      throw formatContainerRuntimeError(error);
    }

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
    extra: {
      // Prevents pg@8 pool from holding the event loop open after destroy(),
      // allowing Jest to exit naturally without forceExit killing idle timers.
      allowExitOnIdle: true,
    },
  });

  await dataSource.initialize();
  console.log('🔄 Running migrations...');
  await dataSource.runMigrations();
  console.log('✅ Migrations complete');
  console.log('Loaded entities:', dataSource.entityMetadatas.map((m) => m.name).join(', '));
  console.log('\n');

  globalThis.__DATA_SOURCE__ = dataSource;
}
