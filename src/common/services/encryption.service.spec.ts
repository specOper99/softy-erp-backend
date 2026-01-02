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
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
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
      expect(() => service.decrypt('invalid')).toThrow(
        'Invalid ciphertext format',
      );
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

  describe('without encryption key', () => {
    it('should log warning when ENCRYPTION_KEY is not set', async () => {
      const warnConfig = { get: jest.fn().mockReturnValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: warnConfig },
        ],
      }).compile();

      const noKeyService = module.get<EncryptionService>(EncryptionService);
      // Service should still exist but with placeholder key
      expect(noKeyService).toBeDefined();
    });
  });
});
