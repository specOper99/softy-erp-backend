export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up e2e test environment...');

  const dataSource = globalThis.__DATA_SOURCE__;
  const postgresContainer = globalThis.__POSTGRES_CONTAINER__;

  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    globalThis.__DATA_SOURCE__ = undefined;
    console.log('✅ DataSource connection closed');
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    globalThis.__POSTGRES_CONTAINER__ = undefined;
    console.log('✅ PostgreSQL container stopped');
  }

  globalThis.__DB_CONFIG__ = undefined;
  console.log('✅ E2E teardown complete\n');
}
