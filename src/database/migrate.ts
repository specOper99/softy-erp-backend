import dataSource from './data-source';

async function runMigrations(): Promise<void> {
  await dataSource.initialize();
  const migrations = await dataSource.runMigrations({ transaction: 'all' });
  if (migrations.length > 0) {
    console.info(`Applied ${migrations.length} migration(s): ${migrations.map((m) => m.name).join(', ')}`);
  } else {
    console.info('No pending migrations.');
  }
  await dataSource.destroy();
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
