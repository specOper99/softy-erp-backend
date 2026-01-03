import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

let postgresContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;

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
  (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (global as any).__DB_CONFIG__ = {
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
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('🔄 Running migrations...');
  await dataSource.runMigrations();
  console.log('✅ Migrations complete\n');

  (global as any).__DATA_SOURCE__ = dataSource;
}
