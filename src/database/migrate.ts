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

async function runPendingMigrationsOnce(): Promise<string[]> {
  const dataSource = new DataSource(dataSourceOptions);

  try {
    await dataSource.initialize();
    const migrations = await dataSource.runMigrations({ transaction: 'each' });
    return migrations.map((migration) => migration.name);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

async function runMigrations(): Promise<void> {
  const connectionConfig = getDatabaseConnectionConfig();
  if (!connectionConfig.host) {
    throw new Error('Database host is not configured. Set DATABASE_URL or complete DB_* variables.');
  }

  const dbWaitRetries = parsePositiveInt(process.env.DB_WAIT_RETRIES, 30, 'DB_WAIT_RETRIES');
  const dbWaitDelay = parsePositiveInt(process.env.DB_WAIT_DELAY, 2, 'DB_WAIT_DELAY');
  const migrateRetries = parsePositiveInt(process.env.MIGRATE_RETRIES, 5, 'MIGRATE_RETRIES');
  const migrateDelay = parsePositiveInt(process.env.MIGRATE_DELAY, 3, 'MIGRATE_DELAY');

  await waitForDatabase(connectionConfig.host, connectionConfig.port, dbWaitRetries, dbWaitDelay);

  console.info('Running database migrations...');

  for (let attempt = 1; attempt <= migrateRetries; attempt += 1) {
    try {
      const migrations = await runPendingMigrationsOnce();
      if (migrations.length > 0) {
        console.info(`Applied ${migrations.length} migration(s): ${migrations.join(', ')}`);
      } else {
        console.info('No pending migrations.');
      }
      return;
    } catch (error) {
      if (attempt === migrateRetries) {
        throw error;
      }

      const message = toErrorMessage(error);
      console.warn(
        `  migration attempt ${attempt}/${migrateRetries} failed (${message}), retrying in ${migrateDelay}s...`,
      );
      await sleep(migrateDelay * 1000);
    }
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
