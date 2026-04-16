export const OPENAPI_EXPORT_FALLBACKS = {
  JWT_SECRET: 'openapi-export-jwt-secret-1234567890abcdef',
  PLATFORM_JWT_SECRET: 'openapi-export-platform-secret-1234567890abcdef',
  CURSOR_SECRET: 'openapi-export-cursor-secret-1234567890abcdef',
} as const;

type MutableEnv = Record<string, string | undefined>;

export function applyOpenApiExportEnv(env: MutableEnv = process.env): MutableEnv {
  env.ENABLE_BACKGROUND_JOBS = 'false';
  env.REDIS_URL = '';
  env.ENABLE_SWAGGER = 'true';
  env.DB_MANUAL_INITIALIZATION = 'true';
  env.DB_RETRY_ATTEMPTS = env.DB_RETRY_ATTEMPTS || '1';
  env.DB_RETRY_DELAY_MS = env.DB_RETRY_DELAY_MS || '0';
  env.DB_CONNECTION_TIMEOUT = env.DB_CONNECTION_TIMEOUT || '2000';

  env.JWT_SECRET = env.JWT_SECRET || OPENAPI_EXPORT_FALLBACKS.JWT_SECRET;
  env.PLATFORM_JWT_SECRET = env.PLATFORM_JWT_SECRET || OPENAPI_EXPORT_FALLBACKS.PLATFORM_JWT_SECRET;
  env.CURSOR_SECRET = env.CURSOR_SECRET || OPENAPI_EXPORT_FALLBACKS.CURSOR_SECRET;

  return env;
}
