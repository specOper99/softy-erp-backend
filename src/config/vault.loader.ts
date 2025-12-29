import vault from 'node-vault';

interface VaultLoginResponse {
  auth: {
    client_token: string;
  };
}

interface VaultReadResponse {
  data: {
    data?: Record<string, string>;
    [key: string]: any;
  };
}

export const vaultLoader = async () => {
  if (process.env.VAULT_ENABLED !== 'true') {
    return {};
  }

  const client = vault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
  });

  try {
    // If AppRole auth is configured, login first
    if (process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID) {
      const result = (await client.approleLogin({
        role_id: process.env.VAULT_ROLE_ID,
        secret_id: process.env.VAULT_SECRET_ID,
      })) as VaultLoginResponse;
      client.token = result.auth.client_token;
    }

    if (!process.env.VAULT_SECRET_PATH) {
      console.warn('VAULT_ENABLED is true but VAULT_SECRET_PATH is missing.');
      return {};
    }

    const kvStore = (await client.read(
      process.env.VAULT_SECRET_PATH,
    )) as VaultReadResponse;
    // Support KV Engine v1 and v2
    // v2 returns data in data.data, v1 in data
    const secrets = kvStore.data.data
      ? kvStore.data.data
      : (kvStore.data as Record<string, string>);

    // We can either map specific secrets to env vars or return the whole object
    // Merging into process.env ensures other config loaders verify them later
    Object.assign(process.env, secrets);

    return secrets;
  } catch (error) {
    console.error(
      'Failed to load secrets from Vault:',
      (error as Error).message,
    );
    // In production, we might want to crash here if vault is critical
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return {};
  }
};
