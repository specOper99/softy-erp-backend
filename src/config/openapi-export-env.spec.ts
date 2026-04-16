import { applyOpenApiExportEnv, OPENAPI_EXPORT_FALLBACKS } from './openapi-export-env';

describe('applyOpenApiExportEnv', () => {
  it('configures queue-free export mode and fills missing auth secrets', () => {
    const env: Record<string, string | undefined> = {};

    applyOpenApiExportEnv(env);

    expect(env.ENABLE_BACKGROUND_JOBS).toBe('false');
    expect(env.REDIS_URL).toBe('');
    expect(env.ENABLE_SWAGGER).toBe('true');
    expect(env.DB_MANUAL_INITIALIZATION).toBe('true');
    expect(env.JWT_SECRET).toBe(OPENAPI_EXPORT_FALLBACKS.JWT_SECRET);
    expect(env.PLATFORM_JWT_SECRET).toBe(OPENAPI_EXPORT_FALLBACKS.PLATFORM_JWT_SECRET);
    expect(env.CURSOR_SECRET).toBe(OPENAPI_EXPORT_FALLBACKS.CURSOR_SECRET);
  });

  it('preserves explicit auth secrets while still applying export defaults', () => {
    const env: Record<string, string | undefined> = {
      JWT_SECRET: 'existing-jwt-secret',
      PLATFORM_JWT_SECRET: 'existing-platform-secret',
      CURSOR_SECRET: 'existing-cursor-secret',
    };

    applyOpenApiExportEnv(env);

    expect(env.JWT_SECRET).toBe('existing-jwt-secret');
    expect(env.PLATFORM_JWT_SECRET).toBe('existing-platform-secret');
    expect(env.CURSOR_SECRET).toBe('existing-cursor-secret');
    expect(env.ENABLE_BACKGROUND_JOBS).toBe('false');
  });
});
