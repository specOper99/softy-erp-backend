import vault from 'node-vault';

/**
 * SECURITY: Whitelist of allowed environment variable names from Vault.
 * Only these keys will be loaded into process.env to prevent process pollution attacks.
 * Add new keys here as needed for your application.
 */
const ALLOWED_VAULT_KEYS = new Set([
  // Database
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  // Authentication
  'JWT_SECRET',
  'PLATFORM_JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'ENCRYPTION_KEY_VERSION',
  'ENCRYPTION_KEY_PREVIOUS',
  'ENCRYPTION_KEY_PREVIOUS_VERSION',
  // Mail
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USER',
  'MAIL_PASS',
  'MAIL_PASSWORD',
  // Storage
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_ENDPOINT',
  'MINIO_BUCKET',
  // Redis
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  // External services
  'SENTRY_DSN',
]);

class VaultLogger {
  private static formatMessage(message: string): string {
    return `[VaultLoader] ${message}`;
  }

  static warn(message: string): void {
    process.stdout.write(`${this.formatMessage(message)}\n`);
  }

  static error(message: string): void {
    process.stderr.write(`${this.formatMessage(message)}\n`);
  }
}

interface VaultLoginResponse {
  auth: {
    client_token: string;
  };
}

interface VaultReadResponse {
  data: {
    data?: Record<string, string>;
    [key: string]: unknown;
  };
}

function isVaultLoginResponse(data: unknown): data is VaultLoginResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'auth' in data &&
    typeof (data as VaultLoginResponse).auth?.client_token === 'string'
  );
}

function isVaultReadResponse(data: unknown): data is VaultReadResponse {
  return (
    typeof data === 'object' && data !== null && 'data' in data && typeof (data as VaultReadResponse).data === 'object'
  );
}

interface TypedVaultClient {
  token: string;
  approleLogin<T>(options: { role_id: string; secret_id: string }): Promise<T>;
  read<T>(path: string): Promise<T>;
}

const createTypedVaultClient = (options: vault.VaultOptions): TypedVaultClient => {
  const client = vault(options);
  return {
    get token() {
      return client.token;
    },
    set token(val) {
      client.token = val;
    },

    approleLogin: (opts) => client.approleLogin(opts),

    read: (path) => client.read(path),
  };
};

export const vaultLoader = async () => {
  if (process.env.VAULT_ENABLED !== 'true') {
    return {};
  }

  if (!process.env.VAULT_ADDR) {
    const message = 'VAULT_ADDR is required when VAULT_ENABLED=true';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    VaultLogger.warn(message);
    return {};
  }

  if (!process.env.VAULT_SECRET_PATH) {
    const message = 'VAULT_SECRET_PATH is required when VAULT_ENABLED=true';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    VaultLogger.warn(message);
    return {};
  }

  const client = createTypedVaultClient({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
  });

  try {
    // If AppRole auth is configured, login first
    if (process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID) {
      const result = await client.approleLogin<VaultLoginResponse>({
        role_id: process.env.VAULT_ROLE_ID,
        secret_id: process.env.VAULT_SECRET_ID,
      });

      if (!isVaultLoginResponse(result)) {
        throw new Error('Invalid Vault login response');
      }
      client.token = result.auth.client_token;
    }

    const kvStore = await client.read<VaultReadResponse>(process.env.VAULT_SECRET_PATH);

    if (!isVaultReadResponse(kvStore)) {
      throw new Error('Invalid Vault read response');
    }
    // Support KV Engine v1 and v2
    // v2 returns data in data.data, v1 in data
    const secrets = kvStore.data.data ? kvStore.data.data : (kvStore.data as Record<string, string>);

    // Validate if casting was correct using runtime check
    if (typeof secrets !== 'object' || secrets === null) {
      throw new Error('Invalid secrets format');
    }

    // SECURITY: Only assign whitelisted environment variables to prevent process pollution
    const filteredSecrets: Record<string, string> = {};
    for (const key of Object.keys(secrets)) {
      if (ALLOWED_VAULT_KEYS.has(key)) {
        const value = secrets[key];
        if (value === undefined) {
          continue;
        }
        if (typeof value !== 'string') {
          VaultLogger.warn(`Ignoring non-string Vault value for key: ${key}`);
          continue;
        }
        filteredSecrets[key] = value;
      } else {
        VaultLogger.warn(`Ignoring non-whitelisted Vault key: ${key}`);
      }
    }

    // Backward compatibility: some environments store the SMTP password as MAIL_PASSWORD,
    // but the app expects MAIL_PASS.
    if (filteredSecrets.MAIL_PASSWORD && !filteredSecrets.MAIL_PASS) {
      filteredSecrets.MAIL_PASS = filteredSecrets.MAIL_PASSWORD;
    }
    delete filteredSecrets.MAIL_PASSWORD;

    Object.assign(process.env, filteredSecrets);

    return filteredSecrets;
  } catch (error) {
    VaultLogger.error(`Failed to load secrets from Vault: ${error instanceof Error ? error.message : String(error)}`);
    // In production, we might want to crash here if vault is critical
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return {};
  }
};
