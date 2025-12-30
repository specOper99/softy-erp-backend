/**
 * E2E-specific Jest setup.
 * This file contains mocks and logic designed to prevent background processes
 * from hanging in the E2E environment.
 */

// Mock ScheduleModule to prevent cron jobs, intervals, and timeouts from leaking
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: jest.fn().mockReturnValue({ module: class {}, providers: [] }),
  },
  Cron: () => jest.fn(),
  Interval: () => jest.fn(),
  Timeout: () => jest.fn(),
}));

// Mock Redis store to prevent persistent connections
jest.mock('cache-manager-redis-yet', () => ({
  redisStore: jest.fn().mockImplementation(() =>
    Promise.resolve({
      store: 'memory',
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      mset: jest.fn(),
      mget: jest.fn(),
      mdel: jest.fn(),
      keys: jest.fn(),
      ttl: jest.fn(),
    }),
  ),
}));

// Mock AWS S3 to prevent socket leaks in connection pool
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = jest.fn().mockResolvedValue({});
    destroy = jest.fn();
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

// Mock S3 Request Presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://mock-signed-url'),
}));

import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

// 1. Load base .env file (if not already loaded)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 2. Load .env.test file with overrides
dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});

// Ensure NODE_ENV is set to test
process.env.NODE_ENV = 'test';

// Run DB migrations once for the e2e worker (production-like schema management)
beforeAll(async () => {
  jest.setTimeout(60_000);

  const globalAny = globalThis as unknown as {
    __E2E_MIGRATIONS_RAN__?: boolean;
    __E2E_MIGRATIONS_RUNNING__?: Promise<void>;
  };

  if (globalAny.__E2E_MIGRATIONS_RAN__) {
    return;
  }
  if (globalAny.__E2E_MIGRATIONS_RUNNING__) {
    await globalAny.__E2E_MIGRATIONS_RUNNING__;
    return;
  }

  globalAny.__E2E_MIGRATIONS_RUNNING__ = (async () => {
    const databaseName = process.env.DB_DATABASE;
    if (!databaseName) {
      throw new Error('DB_DATABASE is required for e2e tests');
    }

    // Safety rail: e2e must never run destructive operations on a non-test database.
    if (!/test/i.test(databaseName)) {
      throw new Error(
        `Refusing to run e2e migrations against non-test database: ${databaseName}. Set DB_DATABASE to a test database (e.g. *_test).`,
      );
    }

    // Ensure the test database exists (create it if missing).
    // We connect to the default 'postgres' database for admin operations.
    const adminDatabase = process.env.DB_ADMIN_DATABASE || 'postgres';
    const adminDataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: adminDatabase,
      entities: [],
      migrations: [],
      logging: false,
    });

    // Only allow simple DB identifiers in CREATE DATABASE to avoid injection.
    if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
      throw new Error(
        `DB_DATABASE must be a simple identifier (letters/numbers/_). Got: ${databaseName}`,
      );
    }

    try {
      await adminDataSource.initialize();
      const exists = await adminDataSource.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName],
      );
      if (!exists?.length) {
        await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
      }
    } finally {
      if (adminDataSource.isInitialized) {
        await adminDataSource.destroy();
      }
    }

    // Load lazily so dotenv config above is applied first.
    const { default: migrationDataSource } =
      await import('../src/database/data-source.js');

    try {
      if (!migrationDataSource.isInitialized) {
        await migrationDataSource.initialize();
      }

      // For deterministic e2e runs, reset schema on the dedicated test database.
      if (process.env.E2E_DB_RESET === 'true') {
        await migrationDataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
        await migrationDataSource.query('CREATE SCHEMA public');
      }

      await migrationDataSource.runMigrations();
      globalAny.__E2E_MIGRATIONS_RAN__ = true;
    } finally {
      if (migrationDataSource.isInitialized) {
        await migrationDataSource.destroy();
      }
      globalAny.__E2E_MIGRATIONS_RUNNING__ = undefined;
    }
  })();

  await globalAny.__E2E_MIGRATIONS_RUNNING__;
});

// Verify critical test overrides
if (process.env.DISABLE_RATE_LIMITING !== 'true') {
  console.warn(
    'WARNING: DISABLE_RATE_LIMITING is not true. E2E tests may fail with 429 errors.',
  );
}

// Logic to ensure REDIS_URL is not set for E2E tests if it wasn't already deleted or empty
if (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') {
  // If .env.test didn't empty it, we forcibly unset it to prevent leakage
  // However, if .env.test explicitly set it to something valid for tests, we should respect it?
  // For now, consistent behavior with previous setup: kill it to rely on mock.
  // But wait, if user wants to use a test redis, they would put it in .env.test.
  // So we should ONLY delete if it equals the production/default one?
  // Safer to just comment this out if we trust .env.test, OR keep it but respect empty string.
  // Current mock setup mocks 'cache-manager-redis-yet' ENTIRELY.
  // So REDIS_URL presence implies the App might try to connect real redis if the mock failed or if other modules use it.
  // The previous setup DELETED it.
  // I will check if .env.test set it to empty string (which is what I did in the file).
  // If it is empty string, we are good.
}

// We rely on the mock for redis, so getting rid of the env var completely is safe to avoid accidental connection attempts by non-mocked parts.
delete process.env.REDIS_URL;
