import vault from 'node-vault';
import { vaultLoader } from './vault.loader';

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
  let mockClient: any;
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
    expect(vault).toHaveBeenCalled();
  });

  it('should fetch secrets with token auth', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.VAULT_ADDR = 'http://localhost:8200';
    process.env.VAULT_TOKEN = 'root';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockResolvedValue({
      data: {
        data: { SECRET_KEY: 'abc' },
      },
    });

    const result = await vaultLoader();

    expect(vault).toHaveBeenCalledWith({
      apiVersion: 'v1',
      endpoint: 'http://localhost:8200',
      token: 'root',
    });
    expect(mockClient.read).toHaveBeenCalledWith('secret/data/app');
    expect(result).toEqual({ SECRET_KEY: 'abc' });
    expect(process.env.SECRET_KEY).toBe('abc');
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
      data: { API_KEY: 'xyz' }, // KV v1 structure
    });

    const result = await vaultLoader();

    expect(mockClient.approleLogin).toHaveBeenCalledWith({
      role_id: 'role-id',
      secret_id: 'secret-id',
    });
    expect(mockClient.read).toHaveBeenCalledWith('secret/app');
    expect(result).toEqual({ API_KEY: 'xyz' });
  });

  it('should handle vault errors gracefully in non-prod', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockRejectedValue(new Error('Connection refused'));

    const result = await vaultLoader();
    expect(result).toEqual({});
  });

  it('should throw error in production if vault fails', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.VAULT_SECRET_PATH = 'secret/data/app';

    mockClient.read.mockRejectedValue(new Error('Critical Vault Error'));

    await expect(vaultLoader()).rejects.toThrow('Critical Vault Error');
  });
});
