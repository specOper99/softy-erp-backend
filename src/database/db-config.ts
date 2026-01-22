/**
 * Shared database connection configuration
 * Used by both data-source.ts and seed.ts to avoid duplication
 */
export interface DatabaseConnectionConfig {
  host: string | undefined;
  port: number;
  username: string | undefined;
  password: string | undefined;
  database: string | undefined;
}

export function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };
}
