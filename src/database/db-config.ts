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

export function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
  const port = parseInt(process.env.DB_PORT || '5432', 10);

  // Validate port is a legal TCP port number — NaN or out-of-range values cause
  // cryptic downstream errors rather than a clear startup failure.
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RuntimeFailure(
      `Invalid DB_PORT value "${process.env.DB_PORT}". Must be an integer in the range 1–65535.`,
    );
  }

  // In production, all DB credentials must be explicitly set.
  if (process.env.NODE_ENV === 'production') {
    const required: Array<[string | undefined, string]> = [
      [process.env.DB_HOST, 'DB_HOST'],
      [process.env.DB_USERNAME, 'DB_USERNAME'],
      [process.env.DB_PASSWORD, 'DB_PASSWORD'],
      [process.env.DB_DATABASE, 'DB_DATABASE'],
    ];
    for (const [value, name] of required) {
      if (!value) {
        throw new RuntimeFailure(`SECURITY: ${name} is required in production environments.`);
      }
    }
  }

  return {
    host: process.env.DB_HOST,
    port,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };
}
