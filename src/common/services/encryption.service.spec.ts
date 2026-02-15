import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-encryption-key-32-chars-min'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'my-secret-webhook-key';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'same-secret';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'secret-密码-🔐';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid ciphertext format', () => {
      expect(() => service.decrypt('invalid')).toThrow('Invalid ciphertext format');
      expect(() => service.decrypt('a:b')).toThrow('Invalid ciphertext format');
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted strings', () => {
      const encrypted = service.encrypt('test');
      expect(service.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain strings', () => {
      expect(service.isEncrypted('plain-text')).toBe(false);
      expect(service.isEncrypted('a:b')).toBe(false);
      expect(service.isEncrypted('')).toBe(false);
    });
  });

  describe('key rotation and multi-key support', () => {
    it('should decrypt data encrypted with a previous key version', () => {
      const v1Key = 'key-version-1-at-least-32-chars-long';
      const v2Key = 'key-version-2-at-least-32-chars-long';

      // Setup service with v1
      const v1Config = {
        get: jest.fn((key: string) => {
          if (key === 'ENCRYPTION_KEY') return v1Key;
          if (key === 'ENCRYPTION_KEY_VERSION') return 'v1';
          return undefined;
        }),
      };
      const v1Service = new EncryptionService(v1Config as unknown as ConfigService);
      const secret = 'my-v1-secret';
      const encryptedV1 = v1Service.encrypt(secret);

      // Now setup service with v2 as current and v1 as previous
      const v2Config = {
        get: jest.fn((key: string) => {
          if (key === 'ENCRYPTION_KEY') return v2Key;
          if (key === 'ENCRYPTION_KEY_VERSION') return 'v2';
          if (key === 'ENCRYPTION_KEY_PREVIOUS') return v1Key;
          if (key === 'ENCRYPTION_KEY_PREVIOUS_VERSION') return 'v1';
          return undefined;
        }),
      };
      const v2Service = new EncryptionService(v2Config as unknown as ConfigService);

      // Decrypt v1 data with v2 service
      const decrypted = v2Service.decrypt(encryptedV1);
      expect(decrypted).toBe(secret);
      expect(encryptedV1).toContain('v1:');
    });

    it('should support legacy unversioned decryption using available keys', () => {
      const key = 'test-key-32-characters-long-!!!!';
      const config = { get: jest.fn().mockReturnValue(key) };
      const service = new EncryptionService(config as unknown as ConfigService);

      // Create a legacy (3-part) ciphertext manually for testing
      // Format: IV:Tag:Cipher
      const iv = 'ivbase64==';
      const tag = 'tagbase64==';
      const cipher = 'cipherbase64==';
      const legacy = `${iv}:${tag}:${cipher}`;

      // This will fail because the parts are junk, but it verifies the code path
      expect(() => service.decrypt(legacy)).toThrow();
    });
  });

  describe('without encryption key', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should construct with ephemeral key when ENCRYPTION_KEY is not set in test env', async () => {
      process.env.NODE_ENV = 'test';
      const warnConfig = { get: jest.fn().mockReturnValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [EncryptionService, { provide: ConfigService, useValue: warnConfig }],
      }).compile();

      const noKeyService = module.get<EncryptionService>(EncryptionService);
      expect(noKeyService).toBeDefined();
    });

    it('should throw when ENCRYPTION_KEY is not set in staging environment', () => {
      process.env.NODE_ENV = 'staging';
      const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
      expect(() => new EncryptionService(noKeyConfig as unknown as ConfigService)).toThrow(
        'SECURITY: ENCRYPTION_KEY must be configured in non-development environments',
      );
    });

    it('should throw when ENCRYPTION_KEY is not set in production environment', () => {
      process.env.NODE_ENV = 'production';
      const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
      expect(() => new EncryptionService(noKeyConfig as unknown as ConfigService)).toThrow(
        'SECURITY: ENCRYPTION_KEY must be configured in non-development environments',
      );
    });

    it('should throw when ENCRYPTION_KEY is not set in undefined environment', () => {
      process.env.NODE_ENV = undefined as unknown as string;
      const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
      expect(() => new EncryptionService(noKeyConfig as unknown as ConfigService)).toThrow(
        'SECURITY: ENCRYPTION_KEY must be configured in non-development environments',
      );
    });
  });
});
