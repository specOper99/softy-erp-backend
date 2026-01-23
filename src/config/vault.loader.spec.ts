import vault from 'node-vault';
import { TEST_SECRETS } from '../../test/secrets';
import { vaultLoader } from './vault.loader';

/** Typed mock for Vault client methods used in tests */
interface MockVaultClient {
  approleLogin: jest.Mock;
  read: jest.Mock;
  token: string;
}

// Mock node-vault factory function
jest.mock('node-vault', () => {
  const mockClient = {
    approleLogin: jest.fn(),
    read: jest.fn(),
    token: '',
  };
  return jest.fn(() => mockClient);
});

describe('vaultLoader', () => {
  let mockClient: MockVaultClient;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Get the mock instance from the mocked factory
    mockClient = (vault as unknown as jest.Mock)();
    // Clear the call count from the line above
    (vault as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty object if VAULT_ENABLED is not true', async () => {
    process.env.VAULT_ENABLED = 'false';
    const result = await vaultLoader();
    expect(result).toEqual({});
    expect(vault).not.toHaveBeenCalled();
  });

  it('should return empty object if VAULT_SECRET_PATH is missing', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    delete process.env.VAULT_SECRET_PATH;

    const result = await vaultLoader();
    expect(result).toEqual({});
    expect(vault).not.toHaveBeenCalled();
  });

  it('should throw in production if VAULT_SECRET_PATH is missing', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    delete process.env.VAULT_SECRET_PATH;

    await expect(vaultLoader()).rejects.toThrow('VAULT_SECRET_PATH is required when VAULT_ENABLED=true');
    expect(vault).not.toHaveBeenCalled();
  });

  it('should return empty object if VAULT_ADDR is missing (non-prod)', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';
    delete process.env.VAULT_ADDR;

    const result = await vaultLoader();
    expect(result).toEqual({});
    expect(vault).not.toHaveBeenCalled();
  });

  it('should throw in production if VAULT_ADDR is missing', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';
    delete process.env.VAULT_ADDR;

    await expect(vaultLoader()).rejects.toThrow('VAULT_ADDR is required when VAULT_ENABLED=true');
    expect(vault).not.toHaveBeenCalled();
  });

  it('should fetch secrets with token auth', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_TOKEN = TEST_SECRETS.VAULT_TOKEN;
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockResolvedValue({
      data: {
        data: { DB_PASSWORD: 'test-db-pass' },
      },
    });

    const result = await vaultLoader();

    expect(vault).toHaveBeenCalledWith({
      apiVersion: 'v1',
      endpoint: 'http://localhost:8200',
      token: TEST_SECRETS.VAULT_TOKEN,
    });
    expect(mockClient.read).toHaveBeenCalledWith('secret/data/app');
    expect(result).toEqual({ DB_PASSWORD: 'test-db-pass' });
    expect(process.env.DB_PASSWORD).toBe('test-db-pass');
  });

  it('should map MAIL_PASSWORD to MAIL_PASS for backward compatibility', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_TOKEN = TEST_SECRETS.VAULT_TOKEN;
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockResolvedValue({
      data: {
        data: { MAIL_PASSWORD: 'test-mail-pass' },
      },
    });

    const result = await vaultLoader();

    expect(result).toEqual({ MAIL_PASS: 'test-mail-pass' });
    expect(process.env.MAIL_PASS).toBe('test-mail-pass');
  });

  it('should ignore non-string secret values', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_TOKEN = TEST_SECRETS.VAULT_TOKEN;
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockResolvedValue({
      data: {
        data: { DB_PORT: 5432, DB_PASSWORD: 'test-db-pass' },
      },
    });

    const result = await vaultLoader();

    expect(result).toEqual({ DB_PASSWORD: 'test-db-pass' });
    expect(process.env.DB_PASSWORD).toBe('test-db-pass');
    expect(process.env.DB_PORT).toBeUndefined();
  });

  it('should authenticat with AppRole if configured', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_ROLE_ID = 'role-id';
    process.env.VAULT_SECRET_ID = 'secret-id';
    process.env.VAULT_SECRET_PATH = 'secret/app'; // KV v1 path style

    mockClient.approleLogin.mockResolvedValue({
      auth: { client_token: 'new-token' },
    });
    mockClient.read.mockResolvedValue({
      data: { JWT_SECRET: 'test-jwt-secret' }, // KV v1 structure
    });

    const result = await vaultLoader();

    expect(mockClient.approleLogin).toHaveBeenCalledWith({
      role_id: 'role-id',
      secret_id: 'secret-id',
    });
    expect(mockClient.read).toHaveBeenCalledWith('secret/app');
    expect(result).toEqual({ JWT_SECRET: 'test-jwt-secret' });
  });

  it('should handle vault errors gracefully in non-prod', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockRejectedValue(new Error('Connection refused'));

    const result = await vaultLoader();
    expect(result).toEqual({});
  });

  it('should throw error in production if vault fails', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockRejectedValue(new Error('Critical Vault Error'));

    await expect(vaultLoader()).rejects.toThrow('Critical Vault Error');
  });
});
