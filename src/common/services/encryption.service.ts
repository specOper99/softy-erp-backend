import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Service for encrypting and decrypting sensitive data using AES-256-GCM.
 * Requires ENCRYPTION_KEY environment variable (minimum 32 characters).
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      this.logger.warn(
        'ENCRYPTION_KEY not configured - encryption will not work',
      );
      this.key = Buffer.alloc(32); // Placeholder for testing
    } else {
      // Derive a 32-byte key from the provided secret using scrypt
      this.key = scryptSync(encryptionKey, 'salt', 32);
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns base64-encoded string containing: IV:AuthTag:Ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: IV:AuthTag:Ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext that was encrypted with encrypt().
   * Expects base64-encoded string: IV:AuthTag:Ciphertext
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const encrypted = Buffer.from(encryptedBase64, 'base64');

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Check if a string appears to be encrypted (has the IV:AuthTag:Ciphertext format).
   */
  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return false;
    }
    // Check if all parts look like base64
    try {
      for (const part of parts) {
        Buffer.from(part, 'base64');
      }
      return true;
    } catch {
      return false;
    }
  }
}
