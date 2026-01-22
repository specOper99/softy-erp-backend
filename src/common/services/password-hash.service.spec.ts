import * as bcryptLib from 'bcrypt';
import { PasswordHashService } from './password-hash.service';

describe('PasswordHashService', () => {
  let service: PasswordHashService;

  beforeEach(() => {
    service = new PasswordHashService();
  });

  describe('hash', () => {
    it('should hash a password using Argon2id', async () => {
      const password = 'SecurePassword123!';
      const hash = await service.hash(password);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toEqual(password);
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'SecurePassword123!';
      const hash1 = await service.hash(password);
      const hash2 = await service.hash(password);

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('verify', () => {
    it('should verify a correct password', async () => {
      const password = 'SecurePassword123!';
      const hash = await service.hash(password);

      const isValid = await service.verify(hash, password);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hash = await service.hash(password);

      const isValid = await service.verify(hash, 'WrongPassword');

      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const isValid = await service.verify('not-a-valid-hash', 'password');

      expect(isValid).toBe(false);
    });
  });

  describe('verifyAndUpgrade', () => {
    it('should verify Argon2id hash without generating upgrade', async () => {
      const password = 'SecurePassword123!';
      const hash = await service.hash(password);

      const result = await service.verifyAndUpgrade(hash, password);

      expect(result.valid).toBe(true);
      expect(result.newHash).toBeUndefined();
      expect(result.upgraded).toBeUndefined();
    });

    it('should reject incorrect password for Argon2id hash', async () => {
      const password = 'SecurePassword123!';
      const hash = await service.hash(password);

      const result = await service.verifyAndUpgrade(hash, 'WrongPassword');

      expect(result.valid).toBe(false);
      expect(result.newHash).toBeUndefined();
    });

    it('should verify bcrypt hash and provide upgrade hash', async () => {
      // Generate a fresh bcrypt hash for testing
      const bcryptHash = await bcryptLib.hash('password123', 10);

      const result = await service.verifyAndUpgrade(bcryptHash, 'password123');

      expect(result.valid).toBe(true);
      expect(result.newHash).toBeDefined();
      expect(result.newHash).toMatch(/^\$argon2id\$/);
      expect(result.upgraded).toBe(true);
    });

    it('should reject incorrect password for bcrypt hash', async () => {
      const bcryptHash = await bcryptLib.hash('password123', 10);

      const result = await service.verifyAndUpgrade(bcryptHash, 'WrongPassword');

      expect(result.valid).toBe(false);
      expect(result.newHash).toBeUndefined();
    });

    it('should return invalid for unknown hash format', async () => {
      const result = await service.verifyAndUpgrade('unknown-hash-format', 'password');

      expect(result.valid).toBe(false);
    });
  });

  describe('needsUpgrade', () => {
    it('should return true for bcrypt hashes', () => {
      const bcryptHashes = ['$2a$12$someHashHere', '$2b$12$someHashHere', '$2y$12$someHashHere'];

      for (const hash of bcryptHashes) {
        expect(service.needsUpgrade(hash)).toBe(true);
      }
    });

    it('should return false for Argon2id hashes', async () => {
      const argon2Hash = await service.hash('password');

      expect(service.needsUpgrade(argon2Hash)).toBe(false);
    });
  });
});
