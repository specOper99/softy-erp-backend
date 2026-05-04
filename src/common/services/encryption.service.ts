import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { RuntimeFailure } from '../errors/runtime-failure';
import { toErrorMessage } from '../utils/error.util';

const scryptAsync = promisify(scrypt);

/**
 * Service for encrypting and decrypting sensitive data using AES-256-GCM.
 * Requires ENCRYPTION_KEY environment variable (minimum 32 characters).
 *
 * Key derivation is performed asynchronously in onModuleInit() to avoid
 * blocking the event loop during bootstrap (scryptSync can take 50-100 ms).
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keys: Map<string, Buffer> = new Map();
  private readonly currentVersion: string;

  // Raw key material stored only long enough to derive keys in onModuleInit.
  private readonly pendingKeys: Array<{ version: string; key: string; salt: string }> = [];

  constructor(private readonly configService: ConfigService) {
    const currentKey = this.configService.get<string>('ENCRYPTION_KEY');
    const currentVersion = this.configService.get<string>('ENCRYPTION_KEY_VERSION') || 'v1';
    const previousKey = this.configService.get<string>('ENCRYPTION_KEY_PREVIOUS');
    const previousVersion = this.configService.get<string>('ENCRYPTION_KEY_PREVIOUS_VERSION');

    if (!currentKey) {
      // CRITICAL: Encryption key MUST be configured in any environment except development/test
      const env = process.env.NODE_ENV;
      if (env !== 'development' && env !== 'test') {
        throw new RuntimeFailure('SECURITY: ENCRYPTION_KEY must be configured in non-development environments');
      }
      this.logger.warn('ENCRYPTION_KEY not configured - using ephemeral development key');
      // Use random key per process to prevent cross-process test data leakage
      this.currentVersion = 'dev';
      this.keys.set('dev', randomBytes(32));
    } else {
      this.currentVersion = currentVersion;
      this.pendingKeys.push({ version: currentVersion, key: currentKey, salt: `softy-erp-${currentVersion}` });

      if (previousKey && previousVersion) {
        this.pendingKeys.push({ version: previousVersion, key: previousKey, salt: `softy-erp-${previousVersion}` });
      }
    }
  }

  /**
   * Derive encryption keys asynchronously so we do not block the event loop
   * with scryptSync during NestJS bootstrap.
   */
  async onModuleInit(): Promise<void> {
    for (const { version, key, salt } of this.pendingKeys) {
      // scrypt: N=16384, r=8, p=1 — Node.js defaults, yields 32-byte key
      const derived = (await scryptAsync(key, salt, 32)) as Buffer;
      this.keys.set(version, derived);
    }
    // Clear raw key material from memory once derived
    this.pendingKeys.length = 0;
  }

  /**
   * Encrypt plaintext using AES-256-GCM with current key.
   *
   * v1/dev  → Version:IV:AuthTag:Ciphertext          (static derivation salt)
   * v2+     → Version:RowSalt:IV:AuthTag:Ciphertext  (per-row HKDF sub-key)
   *
   * The per-row format derives a unique AES key per ciphertext via HKDF so that
   * a single master-key compromise does not immediately expose every row.
   */
  encrypt(plaintext: string): string {
    const masterKey = this.keys.get(this.currentVersion);
    if (!masterKey) throw new RuntimeFailure('Encryption key not configured');

    if (this.currentVersion === 'v1' || this.currentVersion === 'dev') {
      // v1/dev: existing static-salt format (backward-compatible)
      const iv = randomBytes(12);
      const cipher = createCipheriv(this.algorithm, masterKey, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const authTag = cipher.getAuthTag();
      return `${this.currentVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    }

    // v2+: per-row HKDF sub-key  → 5-part format: version:rowSalt:iv:tag:cipher
    const rowSalt = randomBytes(32);
    const rowKey = Buffer.from(hkdfSync('sha256', masterKey, rowSalt, Buffer.from('softy-erp-row-key'), 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, rowKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    // Format: Version:RowSalt:IV:AuthTag:Ciphertext
    return `${this.currentVersion}:${rowSalt.toString('base64')}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext. Supports three formats:
   *   5 parts → v2+ per-row HKDF:  version:rowSalt:iv:tag:cipher
   *   4 parts → v1 static-salt:    version:iv:tag:cipher
   *   3 parts → legacy (no version): iv:tag:cipher
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    let version: string;
    let ivBase64: string;
    let authTagBase64: string;
    let encryptedBase64: string;

    if (parts.length === 5) {
      // v2+ per-row HKDF format: version:rowSalt:iv:tag:cipher
      const [v, rowSaltB64, iv, tag, enc] = parts;
      if (!v || !rowSaltB64 || !iv || !tag || enc === undefined) {
        throw new RuntimeFailure('Invalid ciphertext format');
      }
      const masterKey = this.keys.get(v);
      if (!masterKey) throw new RuntimeFailure(`Unknown encryption key version: ${v}`);
      const rowSalt = Buffer.from(rowSaltB64, 'base64');
      const rowKey = Buffer.from(hkdfSync('sha256', masterKey, rowSalt, Buffer.from('softy-erp-row-key'), 32));
      return this.performDecryption(rowKey, iv, tag, enc);
    } else if (parts.length === 4) {
      // Versioned: version:IV:Tag:Cipher
      const [v, iv, tag, enc] = parts;
      if (!v || !iv || !tag || enc === undefined) {
        throw new RuntimeFailure('Invalid ciphertext format');
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
      throw new RuntimeFailure('Invalid ciphertext format');
    }

    const key = this.keys.get(version);
    if (!key) {
      throw new RuntimeFailure(`Unknown encryption key version: ${version}`);
    }

    return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
  }

  private decryptLegacy(parts: string[]): string {
    const ivBase64 = parts[0];
    const authTagBase64 = parts[1];
    const encryptedBase64 = parts[2];

    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new RuntimeFailure('Invalid legacy ciphertext format');
    }

    // Attempt with current key
    try {
      const key = this.keys.get(this.currentVersion);
      if (key) return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
    } catch (error) {
      // Ignore and try next, but log for observability.
      this.logger.debug(
        `Legacy decrypt failed with current key version ${this.currentVersion}: ${toErrorMessage(error)}`,
      );
    }

    // Attempt with other keys
    for (const [version, key] of this.keys.entries()) {
      if (version === this.currentVersion) continue;
      try {
        return this.performDecryption(key, ivBase64, authTagBase64, encryptedBase64);
      } catch (error) {
        this.logger.debug(`Legacy decrypt failed with key version ${version}: ${toErrorMessage(error)}`);
        continue;
      }
    }

    throw new RuntimeFailure('Failed to decrypt legacy ciphertext');
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

  /**
   * Detect whether a string is an AES-256-GCM ciphertext produced by this service.
   *
   * Checks structural validity rather than doing a simple colon-count:
   *   - 4 parts → versioned format:  version:iv:authTag:cipher
   *   - 3 parts → legacy format:     iv:authTag:cipher
   *
   * For the 4-part case the version field must match a known key version and
   * the remaining three parts must be non-empty base64 strings.  This rejects
   * arbitrary secrets that happen to contain 3–4 colons (e.g. URLs, JWTs).
   */
  isEncrypted(value: string): boolean {
    if (!value) return false;
    const parts = value.split(':');

    if (parts.length === 5) {
      // v2+ per-row HKDF format: version:rowSalt:iv:tag:cipher
      const [version, rowSalt, iv, tag, enc] = parts;
      if (!this.keys.has(version!)) return false;
      return this.isBase64(rowSalt!) && this.isBase64(iv!) && this.isBase64(tag!) && this.isBase64(enc!);
    }

    if (parts.length === 4) {
      const [version, iv, tag, enc] = parts;
      // Version must be a known key (dev, v1, v2, …) — reject unknowns.
      if (!this.keys.has(version!)) return false;
      // Remaining parts must be non-empty base64.
      return this.isBase64(iv!) && this.isBase64(tag!) && this.isBase64(enc!);
    }

    if (parts.length === 3) {
      const [iv, tag, enc] = parts;
      return this.isBase64(iv!) && this.isBase64(tag!) && this.isBase64(enc!);
    }

    return false;
  }

  private isBase64(value: string): boolean {
    if (!value || value.length === 0) return false;
    return /^[A-Za-z0-9+/]+=*$/.test(value);
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getAvailableVersions(): string[] {
    return Array.from(this.keys.keys());
  }

  needsReencryption(ciphertext: string): boolean {
    const parts = ciphertext.split(':');
    if (parts.length === 5) {
      // v2+ per-row format: version:rowSalt:iv:tag:cipher
      const [version] = parts;
      return version !== this.currentVersion;
    }
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
   * Async wrapper for encrypt. Uses setImmediate to yield to the event loop
   * between the encrypt call and the promise resolution — this does NOT offload
   * CPU work to a worker thread; it only defers execution by one tick.
   * For truly non-blocking encryption consider running in a worker_thread.
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
