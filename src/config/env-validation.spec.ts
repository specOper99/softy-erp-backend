import 'reflect-metadata';
import { validate } from './env-validation';

describe('env-validation', () => {
  it('should validate valid configuration', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_SECRET: 'a_very_long_secret_for_jwt_auth_nest_js_erp_test',
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
    };
    expect(() => validate(config)).toThrow();
  });

  it('should allow short JWT_SECRET in non-production environments', () => {
    const config = {
      NODE_ENV: 'development',
      JWT_SECRET: 'short',
    };
    // This should not throw because of the filter in env-validation.ts
    expect(() => validate(config)).not.toThrow();
  });
});
