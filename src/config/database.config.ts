import { registerAs } from '@nestjs/config';
import { join } from 'path';
import { RuntimeFailure } from '../common/errors/runtime-failure';
import { parseEnvInt } from '../common/utils/env-int.util';
import { getDatabaseConnectionConfig } from '../database/db-config';

const parseReplicaHosts = (hostsStr: string | undefined): string[] => {
  if (!hostsStr) return [];
  return hostsStr
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
};

export default registerAs('database', () => {
  const replicaHosts = parseReplicaHosts(process.env.DB_REPLICA_HOSTS);
  const hasReplicas = replicaHosts.length > 0;
  const isProd = process.env.NODE_ENV === 'production';
  const connectionConfig = getDatabaseConnectionConfig();
  // PERFORMANCE: Increased pool size from 50 to 150 for production
  // to prevent connection pool exhaustion under high concurrent load
  const defaultPoolSize = isProd ? 150 : 10;

  // CRITICAL: synchronize is unconditionally disabled. Schema changes must go through migrations only.
  if (process.env.DB_SYNCHRONIZE === 'true') {
    throw new RuntimeFailure('SECURITY: DB_SYNCHRONIZE=true is forbidden in all environments. Use migrations only.');
  }

  const baseConfig = {
    type: 'postgres' as const,
    synchronize: false,
    autoLoadEntities: true,
    manualInitialization: process.env.DB_MANUAL_INITIALIZATION === 'true',
    logging: process.env.DB_LOGGING === 'true' || process.env.NODE_ENV === 'development',
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.js')],
    migrationsTableName: 'migrations',
    // Migrations are explicit-only (npm run migration:run / entrypoint.sh). Never auto-run on Nest boot.
    migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
    retryAttempts: parseEnvInt(process.env.DB_RETRY_ATTEMPTS, 10),
    retryDelay: parseEnvInt(process.env.DB_RETRY_DELAY_MS, 3000),
    // Warn and log slow queries. Default 1000ms; lower in production via DB_MAX_QUERY_MS.
    maxQueryExecutionTime: parseEnvInt(process.env.DB_MAX_QUERY_MS, 1000),
    extra: {
      max: parseEnvInt(process.env.DB_POOL_SIZE, defaultPoolSize),
      connectionTimeoutMillis: parseEnvInt(process.env.DB_CONNECTION_TIMEOUT, 30000),
      idleTimeoutMillis: parseEnvInt(process.env.DB_IDLE_TIMEOUT, 600000),
      statement_timeout: parseEnvInt(process.env.DB_STATEMENT_TIMEOUT, 60000),
    },
  };

  const masterPort = connectionConfig.port;
  const replicaPort = parseEnvInt(process.env.DB_REPLICA_PORT, masterPort);

  if (hasReplicas) {
    return {
      ...baseConfig,
      replication: {
        master: {
          host: connectionConfig.host,
          port: masterPort,
          username: connectionConfig.username,
          password: connectionConfig.password,
          database: connectionConfig.database,
        },
        slaves: replicaHosts.map((host) => ({
          host,
          port: replicaPort,
          username: process.env.DB_REPLICA_USERNAME || connectionConfig.username,
          password: process.env.DB_REPLICA_PASSWORD || connectionConfig.password,
          database: connectionConfig.database,
        })),
      },
    };
  }

  return {
    ...baseConfig,
    host: connectionConfig.host,
    port: masterPort,
    username: connectionConfig.username,
    password: connectionConfig.password,
    database: connectionConfig.database,
  };
});
