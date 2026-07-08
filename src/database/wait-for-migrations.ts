import { Socket } from 'node:net';
import { DataSource } from 'typeorm';
import { toErrorMessage } from '../common/utils/error.util';
import { dataSourceOptions } from './data-source';
import { getDatabaseConnectionConfig } from './db-config';

const SOCKET_TIMEOUT_MS = 3000;

function parsePositiveInt(rawValue: string | undefined, fallback: number, name: string): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    if (rawValue !== undefined) {
      console.warn(`Invalid ${name} value "${rawValue}". Falling back to ${fallback}.`);
    }
    return fallback;
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReachDatabase(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForDatabase(host: string, port: number, retries: number, delaySeconds: number): Promise<void> {
  console.info(`Waiting for PostgreSQL at ${host}:${port} (up to ${retries * delaySeconds}s)...`);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (await canReachDatabase(host, port)) {
      console.info('PostgreSQL is reachable.');
      return;
    }

    if (attempt === retries) {
      throw new Error(`PostgreSQL at ${host}:${port} not reachable after ${retries} attempts.`);
    }

    console.info(`  attempt ${attempt}/${retries} - not ready, retrying in ${delaySeconds}s...`);
    await sleep(delaySeconds * 1000);
  }
}

/**
 * Poll until TypeORM reports no pending migrations.
 * Devops must apply schema changes via `node dist/database/migrate.js`
 * (or `npm run migration:run:prod`) before the app boots.
 */
async function waitForMigrationsApplied(): Promise<void> {
  const connectionConfig = getDatabaseConnectionConfig();
  if (!connectionConfig.host) {
    throw new Error('Database host is not configured. Set DATABASE_URL or complete DB_* variables.');
  }

  const dbWaitRetries = parsePositiveInt(process.env.DB_WAIT_RETRIES, 30, 'DB_WAIT_RETRIES');
  const dbWaitDelay = parsePositiveInt(process.env.DB_WAIT_DELAY, 2, 'DB_WAIT_DELAY');
  const migrationWaitRetries = parsePositiveInt(process.env.MIGRATION_WAIT_RETRIES, 60, 'MIGRATION_WAIT_RETRIES');
  const migrationWaitDelay = parsePositiveInt(process.env.MIGRATION_WAIT_DELAY, 5, 'MIGRATION_WAIT_DELAY');

  await waitForDatabase(connectionConfig.host, connectionConfig.port, dbWaitRetries, dbWaitDelay);

  console.info(
    `Waiting for database migrations to be applied by devops (up to ${migrationWaitRetries * migrationWaitDelay}s)...`,
  );
  console.info('Admin command: node dist/database/migrate.js  (or: npm run migration:run:prod)');

  for (let attempt = 1; attempt <= migrationWaitRetries; attempt += 1) {
    const dataSource = new DataSource(dataSourceOptions);
    try {
      await dataSource.initialize();
      const hasPending = await dataSource.showMigrations();
      if (!hasPending) {
        console.info('No pending migrations. Schema is ready.');
        return;
      }
    } catch (error) {
      console.warn(`  attempt ${attempt}/${migrationWaitRetries} - migration check failed (${toErrorMessage(error)})`);
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }

    if (attempt === migrationWaitRetries) {
      throw new Error(
        `Timed out waiting for migrations after ${migrationWaitRetries} attempts. ` +
          'Run migrations as devops admin before deploying the app: node dist/database/migrate.js',
      );
    }

    console.info(
      `  attempt ${attempt}/${migrationWaitRetries} - pending migrations still present, retrying in ${migrationWaitDelay}s...`,
    );
    await sleep(migrationWaitDelay * 1000);
  }
}

waitForMigrationsApplied()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Wait for migrations failed:', err);
    process.exit(1);
  });
