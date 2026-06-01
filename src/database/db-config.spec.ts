import 'reflect-metadata';
import { resolveDatabaseConnectionConfig, resolveReplicaConnectionConfigs } from './db-config';

describe('db-config', () => {
  it('uses split DB_* configuration when all required values are present', () => {
    const config = resolveDatabaseConnectionConfig({
      DB_HOST: 'postgres',
      DB_PORT: '5433',
      DB_USERNAME: 'softy',
      DB_PASSWORD: 'secret',
      DB_DATABASE: 'softy_erp',
    });

    expect(config).toEqual({
      host: 'postgres',
      port: 5433,
      username: 'softy',
      password: 'secret',
      database: 'softy_erp',
    });
  });

  it('falls back to DATABASE_URL when split DB_* configuration is absent', () => {
    const config = resolveDatabaseConnectionConfig({
      DATABASE_URL: 'postgresql://softy:super%23secret@db.internal:6543/softy_erp',
    });

    expect(config).toEqual({
      host: 'db.internal',
      port: 6543,
      username: 'softy',
      password: 'super#secret',
      database: 'softy_erp',
    });
  });

  it('prefers complete split DB_* configuration over DATABASE_URL', () => {
    const config = resolveDatabaseConnectionConfig({
      DATABASE_URL: 'postgresql://url_user:url_pass@db.internal:6543/from_url',
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_USERNAME: 'env_user',
      DB_PASSWORD: 'env_pass',
      DB_DATABASE: 'from_env',
    });

    expect(config).toEqual({
      host: 'postgres',
      port: 5432,
      username: 'env_user',
      password: 'env_pass',
      database: 'from_env',
    });
  });

  it('throws in production when DB_* configuration is incomplete', () => {
    expect(() =>
      resolveDatabaseConnectionConfig({
        NODE_ENV: 'production',
        DB_HOST: 'postgres',
      }),
    ).toThrow('SECURITY: incomplete DB_* configuration');
  });

  it('rejects invalid DATABASE_URL protocols', () => {
    expect(() =>
      resolveDatabaseConnectionConfig({
        DATABASE_URL: 'mysql://softy:secret@db.internal:3306/softy_erp',
      }),
    ).toThrow('Invalid DATABASE_URL protocol');
  });

  it('builds replica configs from DB_REPLICA_* with primary credential fallback', () => {
    const replicas = resolveReplicaConnectionConfigs({
      DATABASE_URL: 'postgresql://softy:super%23secret@db.internal:6543/softy_erp',
      DB_REPLICA_HOSTS: 'replica-a.internal, replica-b.internal ',
      DB_REPLICA_PORT: '7654',
    });

    expect(replicas).toEqual([
      {
        host: 'replica-a.internal',
        port: 7654,
        username: 'softy',
        password: 'super#secret',
        database: 'softy_erp',
      },
      {
        host: 'replica-b.internal',
        port: 7654,
        username: 'softy',
        password: 'super#secret',
        database: 'softy_erp',
      },
    ]);
  });
});
