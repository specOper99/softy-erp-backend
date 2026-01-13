import vault from 'node-vault';

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

    if (!process.env.VAULT_SECRET_PATH) {
      VaultLogger.warn('VAULT_ENABLED is true but VAULT_SECRET_PATH is missing.');
      return {};
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

    // We can either map specific secrets to env vars or return the whole object
    // Merging into process.env ensures other config loaders verify them later
    Object.assign(process.env, secrets);

    return secrets;
  } catch (error) {
    VaultLogger.error(`Failed to load secrets from Vault: ${error instanceof Error ? error.message : String(error)}`);
    // In production, we might want to crash here if vault is critical
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return {};
  }
};
