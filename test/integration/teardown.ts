export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up integration test environment...');

  const dataSource = globalThis.__DATA_SOURCE__;
  const postgresContainer = globalThis.__POSTGRES_CONTAINER__;

  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    console.log('✅ DataSource connection closed');
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    console.log('✅ PostgreSQL container stopped\n');
  }
}
