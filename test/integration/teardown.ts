export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up integration test environment...');

  const dataSource = (global as any).__DATA_SOURCE__;
  const postgresContainer = (global as any).__POSTGRES_CONTAINER__;

  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    console.log('✅ DataSource connection closed');
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    console.log('✅ PostgreSQL container stopped\n');
  }
}
