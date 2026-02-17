import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

let postgresContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;

const migrationNameOverrides: Record<string, string> = {
  EnforceGlobalUniqueUserEmail20260125000000: 'EnforceGlobalUniqueUserEmail2026012500000',
  AddBookingStatusConstraints1738108524000: 'AddBookingStatusConstraints1768000000100',
};

function normalizeMigrationNamesForTypeOrm(migrations: DataSource['migrations']): void {
  for (const migration of migrations) {
    const rawName = migration.name || migration.constructor.name;

    const overrideName = migrationNameOverrides[rawName];
    if (overrideName) {
      migration.name = overrideName;
      continue;
    }

    const parts = rawName.match(/^(.*?)(\d+)$/);
    if (!parts) {
      continue;
    }

    const [, baseName, numericSuffix] = parts;
    if (numericSuffix.length <= 13) {
      continue;
    }

    migration.name = `${baseName}${numericSuffix.slice(0, 13)}`;
  }
}

export default async function globalSetup() {
  console.log('\n🐳 Starting PostgreSQL container for integration tests...');

  // Start PostgreSQL container
  postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withExposedPorts(5432)
    .start();

  const port = postgresContainer.getPort();
  const host = postgresContainer.getHost();

  console.log(`✅ PostgreSQL container started on ${host}:${port}`);

  // Store connection details in global for tests to use
  globalThis.__POSTGRES_CONTAINER__ = postgresContainer;
  globalThis.__DB_CONFIG__ = {
    host,
    port,
    username: 'test_user',
    password: 'test_password',
    database: 'test_db',
  };

  // Create DataSource and run migrations
  dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username: 'test_user',
    password: 'test_password',
    database: 'test_db',
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
