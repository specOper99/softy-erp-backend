import { RuntimeFailure } from '../common/errors/runtime-failure';
/**
 * Shared database connection configuration for CLI/standalone contexts.
 *
 * INTENTIONAL: This function reads `process.env` directly rather than going
 * through NestJS `ConfigService`. It is called from TypeORM CLI (data-source.ts)
 * and seed scripts (seed.ts) which run outside the NestJS DI container where
 * ConfigService is unavailable.
 *
 * The NestJS application runtime uses ConfigService via TypeOrmModule.forRootAsync
 * in app.module.ts, which reads from the validated `database.*` config namespace.
 * Environment variables are validated by EnvironmentVariables (env-validation.ts)
 * before this function is called in any context.
 */
export interface DatabaseConnectionConfig {
  host: string | undefined;
  port: number;
  username: string | undefined;
  password: string | undefined;
  database: string | undefined;
}

type EnvLike = Record<string, unknown>;

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

function getEnvText(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function parsePort(rawPort: string | undefined, sourceName = 'DB_PORT'): number {
  const port = parseInt(rawPort || '5432', 10);

  // Validate port is a legal TCP port number — NaN or out-of-range values cause
  // cryptic downstream errors rather than a clear startup failure.
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RuntimeFailure(`Invalid ${sourceName} value "${rawPort}". Must be an integer in the range 1–65535.`);
  }

  return port;
}

function parseDatabaseUrl(databaseUrl: string): DatabaseConnectionConfig {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new RuntimeFailure('Invalid DATABASE_URL value. Must be a valid postgres connection string.');
  }

  if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new RuntimeFailure(
      `Invalid DATABASE_URL protocol "${parsedUrl.protocol}". Use postgres:// or postgresql://.`,
    );
  }

  const host = parsedUrl.hostname || undefined;
  const username = parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined;
  const password = parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined;
  const database = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')) || undefined;

  if (!host) {
    throw new RuntimeFailure('Invalid DATABASE_URL value. Missing hostname.');
  }

  if (!username) {
    throw new RuntimeFailure('Invalid DATABASE_URL value. Missing username.');
  }

  if (!password) {
    throw new RuntimeFailure('Invalid DATABASE_URL value. Missing password.');
  }

  if (!database) {
    throw new RuntimeFailure('Invalid DATABASE_URL value. Missing database name.');
  }

  return {
    host,
    port: parsePort(parsedUrl.port || '5432', 'DATABASE_URL port'),
    username,
    password,
    database,
  };
}

export function resolveDatabaseConnectionConfig(env: EnvLike = process.env): DatabaseConnectionConfig {
  const host = getEnvText(env, 'DB_HOST');
  const username = getEnvText(env, 'DB_USERNAME');
  const password = getEnvText(env, 'DB_PASSWORD');
  const database = getEnvText(env, 'DB_DATABASE');
  const port = getEnvText(env, 'DB_PORT');
  const databaseUrl = getEnvText(env, 'DATABASE_URL');

  const splitValues = [host, username, password, database];
  const hasCompleteSplitConfig = splitValues.every((value) => value);

  if (hasCompleteSplitConfig) {
    return {
      host,
      port: parsePort(port, 'DB_PORT'),
      username,
      password,
      database,
    };
  }

  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl);
  }

  // In production, all DB credentials must be explicitly set.
  if (env.NODE_ENV === 'production') {
    if (splitValues.some((value) => value) || port) {
      throw new RuntimeFailure(
        'SECURITY: incomplete DB_* configuration. Set DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_DATABASE together, or use DATABASE_URL.',
      );
    }

    throw new RuntimeFailure(
      'SECURITY: DATABASE_URL or complete DB_* configuration is required in production environments.',
    );
  }

  return {
    host,
    port: parsePort(port, 'DB_PORT'),
    username,
    password,
    database,
  };
}

export function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
  return resolveDatabaseConnectionConfig(process.env as EnvLike);
}
