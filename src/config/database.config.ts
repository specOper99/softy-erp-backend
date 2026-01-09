import { registerAs } from '@nestjs/config';

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
  // PERFORMANCE: Increased pool size from 50 to 150 for production
  // to prevent connection pool exhaustion under high concurrent load
  const defaultPoolSize = isProd ? 150 : 10;

  const baseConfig = {
    type: 'postgres' as const,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    autoLoadEntities: true,
    logging:
      process.env.DB_LOGGING === 'true' ||
      process.env.NODE_ENV === 'development',
    extra: {
      max: parseInt(process.env.DB_POOL_SIZE || defaultPoolSize.toString(), 10),
      connectionTimeoutMillis: parseInt(
        process.env.DB_CONNECTION_TIMEOUT || '30000',
        10,
      ),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '600000', 10),
      statement_timeout: parseInt(
        process.env.DB_STATEMENT_TIMEOUT || '60000',
        10,
      ),
    },
  };

  if (hasReplicas) {
    return {
      ...baseConfig,
      replication: {
        master: {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
        },
        slaves: replicaHosts.map((host) => ({
          host,
          port: parseInt(
            process.env.DB_REPLICA_PORT || process.env.DB_PORT || '5432',
            10,
          ),
          username: process.env.DB_REPLICA_USERNAME || process.env.DB_USERNAME,
          password: process.env.DB_REPLICA_PASSWORD || process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
        })),
      },
    };
  }

  return {
    ...baseConfig,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };
});
