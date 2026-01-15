import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { DataSource } from 'typeorm';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
  var __DATA_SOURCE__: DataSource | undefined;
  var __DB_CONFIG__:
    | {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
      }
    | undefined;
  var testTenantId: string | undefined;
}

export {};
