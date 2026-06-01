import { DataSource } from 'typeorm';

/**
 * Creates a TypeORM DataSource configured for integration tests.
 *
 * Uses `extra: { allowExitOnIdle: true }` (pg@8.9+) so that the pg connection
 * pool does not hold the Node.js event loop open after `dataSource.destroy()`
 * is called. Without this, Jest's `forceExit` must kill the remaining idle-
 * timer handle, printing a "Force exiting Jest" notice on every integration run.
 */
export function createTestDataSource(): DataSource {
  const dbConfig = globalThis.__DB_CONFIG__!;
  return new DataSource({
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    entities: [__dirname + '/../../src/**/*.entity.ts'],
    synchronize: false,
    extra: {
      // Prevents pg@8 pool from holding the event loop open when idle,
      // allowing Jest to exit naturally without --forceExit.
      allowExitOnIdle: true,
    },
  });
}
