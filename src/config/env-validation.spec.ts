import 'reflect-metadata';
import { validate } from './env-validation';

describe('env-validation', () => {
  it('should validate valid configuration', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: 3000,
      // Must contain both letters and numbers for minimum complexity
      JWT_SECRET: 'a_very_long_secret_for_jwt_auth123456789_nest_js',
    };

    const result = validate(config);
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
  });

  it('should use default values in non-production (JWT_SECRET optional)', () => {
    const config = {};
    const result = validate(config);
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    // JWT_SECRET has no default value for security - only required in production
    expect(result.JWT_SECRET).toBeUndefined();
  });

  it('should throw error for invalid NODE_ENV', () => {
    const config = {
      NODE_ENV: 'invalid',
    };
    expect(() => validate(config)).toThrow();
  });

  it('should throw error for invalid PORT type', () => {
    const config = {
      PORT: 'not-a-number',
    };
    expect(() => validate(config)).toThrow();
  });

  it('should enforce JWT_SECRET length in production', () => {
    const config = {
      NODE_ENV: 'production',
      JWT_SECRET: 'short',
      PLATFORM_JWT_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6',
    };
    expect(() => validate(config)).toThrow();
  });

  it('should not require TENANT_ALLOWED_DOMAINS in production', () => {
    const config = {
      NODE_ENV: 'production',
      // High-entropy-ish string (length >= 43) to pass validateSecretStrength
      JWT_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6',
      PLATFORM_JWT_SECRET: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4',
    };

    expect(() => validate(config)).not.toThrow();
  });

  it('should reject placeholder secrets in production', () => {
    const config = {
      NODE_ENV: 'production',
      // High-entropy-ish string (length >= 43) to pass validateSecretStrength
      JWT_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6',
      PLATFORM_JWT_SECRET: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4',
      DB_PASSWORD: 'change-me-local-only',
    };

    expect(() => validate(config)).toThrow('SECURITY: DB_PASSWORD appears to be a placeholder value');
  });

  it('should allow short JWT_SECRET in test environment', () => {
    const config = {
      NODE_ENV: 'test',
      JWT_SECRET: 'short',
    };
    // This should not throw because of the filter in env-validation.ts
    expect(() => validate(config)).not.toThrow();
  });

  it('should enforce JWT_SECRET length in development', () => {
    const config = {
      NODE_ENV: 'development',
      JWT_SECRET: 'short',
    };
    expect(() => validate(config)).toThrow();
  });

  describe('Vault enforcement (VAULT_ENABLED=true)', () => {
    it('should require VAULT_ADDR', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_TOKEN: 'token',
        VAULT_SECRET_PATH: 'secret/data/app',
      };
      expect(() => validate(config)).toThrow('SECURITY: VAULT_ADDR is required when VAULT_ENABLED=true');
    });

    it('should require VAULT_SECRET_PATH', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_ADDR: 'http://localhost:8200',
        VAULT_TOKEN: 'token',
      };
      expect(() => validate(config)).toThrow('SECURITY: VAULT_SECRET_PATH is required when VAULT_ENABLED=true');
    });

    it('should require Vault auth (token or full AppRole)', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_ADDR: 'http://localhost:8200',
        VAULT_SECRET_PATH: 'secret/data/app',
      };
      expect(() => validate(config)).toThrow(
        'SECURITY: Vault auth must use VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID when VAULT_ENABLED=true',
      );
    });

    it('should reject partial AppRole config', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_ADDR: 'http://localhost:8200',
        VAULT_SECRET_PATH: 'secret/data/app',
        VAULT_ROLE_ID: 'role',
      };
      expect(() => validate(config)).toThrow(
        'SECURITY: Vault AppRole auth requires both VAULT_ROLE_ID and VAULT_SECRET_ID',
      );
    });

    it('should allow token auth', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_ADDR: 'http://localhost:8200',
        VAULT_SECRET_PATH: 'secret/data/app',
        VAULT_TOKEN: 'token',
      };
      expect(() => validate(config)).not.toThrow();
    });

    it('should allow AppRole auth', () => {
      const config = {
        NODE_ENV: 'development',
        VAULT_ENABLED: 'true',
        VAULT_ADDR: 'http://localhost:8200',
        VAULT_SECRET_PATH: 'secret/data/app',
        VAULT_ROLE_ID: 'role',
        VAULT_SECRET_ID: 'secret',
      };
      expect(() => validate(config)).not.toThrow();
    });
  });

  it('should reject invalid VAULT_ENABLED values', () => {
    const config = {
      NODE_ENV: 'development',
      VAULT_ENABLED: 'yes',
    };
    expect(() => validate(config)).toThrow('VAULT_ENABLED');
  });
});
