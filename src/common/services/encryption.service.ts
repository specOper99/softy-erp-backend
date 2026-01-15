import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Service for encrypting and decrypting sensitive data using AES-256-GCM.
 * Requires ENCRYPTION_KEY environment variable (minimum 32 characters).
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keys: Map<string, Buffer> = new Map();
  private readonly currentVersion: string;

  constructor(private readonly configService: ConfigService) {
    const currentKey = this.configService.get<string>('ENCRYPTION_KEY');
    const currentVersion = this.configService.get<string>('ENCRYPTION_KEY_VERSION') || 'v1';
    const previousKey = this.configService.get<string>('ENCRYPTION_KEY_PREVIOUS');
    const previousVersion = this.configService.get<string>('ENCRYPTION_KEY_PREVIOUS_VERSION');

    if (!currentKey) {
      // CRITICAL: Encryption key MUST be configured in production
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SECURITY: ENCRYPTION_KEY must be configured in production');
      }
      this.logger.warn('ENCRYPTION_KEY not configured - using ephemeral development key');
      // Use random key per process to prevent cross-process test data leakage
      this.currentVersion = 'dev';
      this.keys.set('dev', randomBytes(32));
    } else {
      this.currentVersion = currentVersion;
      // Use version as unique salt component for key derivation
      const currentSalt = `chapters-erp-${currentVersion}`;
      this.keys.set(currentVersion, scryptSync(currentKey, currentSalt, 32));

      if (previousKey && previousVersion) {
        const previousSalt = `chapters-erp-${previousVersion}`;
        this.keys.set(previousVersion, scryptSync(previousKey, previousSalt, 32));
      }
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM with current key.
   * Returns: Version:IV:AuthTag:Ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const key = this.keys.get(this.currentVersion);
    if (!key) throw new Error('Encryption key not configured');

    const cipher = createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: Version:IV:AuthTag:Ciphertext
    return `${this.currentVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext. Supports both versioned and legacy (unversioned) formats.
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    let version: string;
    let ivBase64: string;
    let authTagBase64: string;
    let encryptedBase64: string;

    if (parts.length === 4) {
      // Versioned: v2:IV:Tag:Cipher
      const [v, iv, tag, enc] = parts;
      if (!v || !iv || !tag || !enc) {
        throw new Error('Invalid ciphertext format');
      }
      version = v;
      ivBase64 = iv;
      authTagBase64 = tag;
      encryptedBase64 = enc;
    } else if (parts.length === 3) {
      // Legacy: IV:Tag:Cipher (Assumed to be v1 or whatever current matches if unversioned)
      // If we are rotating, legacy data usually belongs to PREVIOUS key if we just rotated.
      // Or it belongs to Current Key if we started with v1.
      // Strategy: Try Current, then Previous.
      return this.decryptLegacy(parts);
    } else {
      throw new Error('Invalid ciphertext format');
    }

    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Unknown encryption key version: ${version}`);
    }

    return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
  }

  private decryptLegacy(parts: string[]): string {
    const ivBase64 = parts[0];
    const authTagBase64 = parts[1];
    const encryptedBase64 = parts[2];

    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new Error('Invalid legacy ciphertext format');
    }

    // Attempt with current key
    try {
      const key = this.keys.get(this.currentVersion);
      if (key) return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
    } catch {
      // Ignore and try next
    }

    // Attempt with other keys
    for (const [version, key] of this.keys.entries()) {
      if (version === this.currentVersion) continue;
      try {
        return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
      } catch {
        continue;
      }
    }

    throw new Error('Failed to decrypt legacy ciphertext');
  }

  private performDecryption(key: Buffer, ivB64: string, tagB64: string, encB64: string): string {
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');

    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length === 4) {
      return true;
    }
    if (parts.length === 3) {
      return true;
    }
    return false;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getAvailableVersions(): string[] {
    return Array.from(this.keys.keys());
  }

  needsReencryption(ciphertext: string): boolean {
    const parts = ciphertext.split(':');
    if (parts.length === 4) {
      const [version] = parts;
      return version !== this.currentVersion;
    }
    return true;
  }

  reencrypt(ciphertext: string): string {
    if (!this.needsReencryption(ciphertext)) {
      return ciphertext;
    }
    const plaintext = this.decrypt(ciphertext);
    return this.encrypt(plaintext);
  }

  /**
   * Async version of encrypt - offloads to next event loop tick
   * to prevent blocking during intensive crypto operations.
   */
  async encryptAsync(plaintext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.encrypt(plaintext));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  /**
   * Async version of decrypt - offloads to next event loop tick
   * to prevent blocking during intensive crypto operations.
   */
  async decryptAsync(ciphertext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.decrypt(ciphertext));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  /**
   * Async version of reencrypt - for background key rotation tasks.
   */
  async reencryptAsync(ciphertext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.reencrypt(ciphertext));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}
