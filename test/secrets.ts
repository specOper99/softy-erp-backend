export const TEST_SECRETS = {
  PASSWORD: process.env.TEST_PASSWORD || 'testpassword123',
  WRONG_PASSWORD: process.env.TEST_WRONG_PASSWORD || 'wrongpassword',
  JWT_SECRET: process.env.TEST_JWT_SECRET || 'test-jwt-secret-minimum-32-chars-here',
  ENCRYPTION_KEY: process.env.TEST_ENCRYPTION_KEY || 'test-encryption-key-32-chars-min',
  VAULT_TOKEN: process.env.TEST_VAULT_TOKEN || 'test-root-token',
  STORAGE_SECRET_KEY: process.env.TEST_STORAGE_SECRET_KEY || 'test-secret-key-placeholder-32-chars',
  WEBHOOK_SECRET: process.env.TEST_WEBHOOK_SECRET || 'test-webhook-secret-placeholder-long',
};
