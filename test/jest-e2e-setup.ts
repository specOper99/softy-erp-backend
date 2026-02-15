import { EventEmitter } from 'events';

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
  CronExpression: {
    EVERY_10_SECONDS: '*/10 * * * * *',
    EVERY_MINUTE: '* * * * *',
    EVERY_10_MINUTES: '*/10 * * * *',
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

jest.mock('ioredis', () => {
  const createMockRedis = function () {
    const instance = Object.create(EventEmitter.prototype);
    instance.on = jest.fn();
    instance.once = jest.fn();
    instance.set = jest.fn().mockResolvedValue('OK');
    instance.eval = jest.fn().mockResolvedValue(1);
    instance.exists = jest.fn().mockResolvedValue(0);
    instance.quit = jest.fn().mockResolvedValue('OK');
    instance.disconnect = jest.fn();
    instance.duplicate = jest.fn().mockImplementation(() => createMockRedis());
    instance.status = 'ready';
    instance.connect = jest.fn().mockResolvedValue(undefined);
    instance.ping = jest.fn().mockResolvedValue('PONG');
    // Implement defineCommand to actually attach the command to the instance
    // BullMQ registers commands (e.g., "dismiss", "moveToWaitingChildren") and later calls them by name
    instance.defineCommand = jest.fn(function (name: string) {
      instance[name] = jest.fn().mockResolvedValue([]);
    });
    instance.sendCommand = jest.fn().mockResolvedValue({});
    instance.info = jest.fn().mockResolvedValue('redis_version:7.0.0');
    instance.get = jest.fn().mockResolvedValue(null);
    instance.hset = jest.fn().mockResolvedValue(1);
    instance.hget = jest.fn().mockResolvedValue(null);
    instance.hgetall = jest.fn().mockResolvedValue({});
    instance.del = jest.fn().mockResolvedValue(0);
    instance.expire = jest.fn().mockResolvedValue(1);
    instance.ttl = jest.fn().mockResolvedValue(-1);
    instance.sadd = jest.fn().mockResolvedValue(1);
    instance.srem = jest.fn().mockResolvedValue(1);
    instance.smembers = jest.fn().mockResolvedValue([]);
    instance.sismember = jest.fn().mockResolvedValue(0);
    instance.zadd = jest.fn().mockResolvedValue(1);
    instance.zrem = jest.fn().mockResolvedValue(1);
    instance.zrange = jest.fn().mockResolvedValue([]);
    instance.zrangebyscore = jest.fn().mockResolvedValue([]);
    instance.zcard = jest.fn().mockResolvedValue(0);
    // BullMQ uses blocking sorted set commands
    // Add delay to prevent busy-loop - BullMQ will poll with timeout, so we return null after delay
    instance.bzpopmin = jest
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 50)));
    instance.bzpopmax = jest
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 50)));
    instance.zpopmin = jest.fn().mockResolvedValue([]);
    instance.zpopmax = jest.fn().mockResolvedValue([]);
    instance.incr = jest.fn().mockResolvedValue(1);
    instance.decr = jest.fn().mockResolvedValue(0);
    instance.lpush = jest.fn().mockResolvedValue(1);
    instance.rpop = jest.fn().mockResolvedValue(null);
    instance.llen = jest.fn().mockResolvedValue(0);
    instance.keys = jest.fn().mockResolvedValue([]);
    instance.flushdb = jest.fn().mockResolvedValue('OK');
    return instance;
  };

  return {
    __esModule: true,
    default: createMockRedis,
    Redis: createMockRedis,
  };
});

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

// 1. Load base .env file (if not already loaded)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 2. Load .env.test file with overrides
dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});

// 3. Restore testcontainer DB settings (global-setup sets these before this file runs)
// The .env.test override above would overwrite them, so we restore from globalThis.__DB_CONFIG__
if (globalThis.__DB_CONFIG__) {
  process.env.DB_HOST = globalThis.__DB_CONFIG__.host;
  process.env.DB_PORT = String(globalThis.__DB_CONFIG__.port);
  process.env.DB_USERNAME = globalThis.__DB_CONFIG__.username;
  process.env.DB_PASSWORD = globalThis.__DB_CONFIG__.password;
  process.env.DB_DATABASE = globalThis.__DB_CONFIG__.database;
}

// Ensure NODE_ENV is set to test
process.env.NODE_ENV = 'test';

process.env.DB_LOGGING = 'false';

// Migrations and DB setup are now handled in jest-e2e-global-setup.ts

// Verify critical test overrides
if (process.env.DISABLE_RATE_LIMITING !== 'true') {
  console.warn('WARNING: DISABLE_RATE_LIMITING is not true. E2E tests may fail with 429 errors.');
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

// Clear Prometheus metrics registry before each test to prevent "already registered" errors
import * as promClient from 'prom-client';
beforeEach(() => {
  promClient.register.clear();
});
