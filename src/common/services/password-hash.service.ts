/**
 * PasswordHashService - Centralized password hashing using Argon2id (2025 standard)
 *
 * This service replaces deprecated bcrypt usage across the codebase with Argon2id,
 * which provides memory-hard hashing resistant to GPU/ASIC attacks.
 *
 * Key features:
 * - Argon2id (hybrid mode: data-independent + data-dependent)
 * - Memory-hard: 64MB RAM requirement makes GPU attacks 10-100x more expensive
 * - Backward compatibility: gradual migration from bcrypt during user login
 * - OWASP 2025 compliant
 */
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordHashService {
  private readonly logger = new Logger(PasswordHashService.name);

  /**
   * Argon2id configuration following OWASP 2025 recommendations.
   * These parameters provide:
   * - ~500ms hashing time on modern CPU
   * - 64MB memory requirement (resistant to GPU attacks)
   * - Good balance between security and UX
   */
  private readonly ARGON2_OPTIONS: argon2.Options = {
    type: argon2.argon2id, // Hybrid: data-independent + data-dependent
    memoryCost: 65536, // 64 MB - resistant to GPU attacks
    timeCost: 3, // 3 iterations - ~500ms on modern CPU
    parallelism: 4, // 4 threads
  };

  /**
   * Hash a password using Argon2id.
   *
   * @param password - The plain text password to hash
   * @returns The Argon2id hash string
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.ARGON2_OPTIONS);
  }

  /**
   * Verify a password against an Argon2id hash.
   *
   * @param hash - The stored Argon2id hash
   * @param password - The plain text password to verify
   * @returns True if the password matches, false otherwise
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      // Fail closed: treat verification errors as non-match.
      this.logger.warn(
        `Password verification error: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Verify a password and upgrade the hash if it's using deprecated bcrypt.
   *
   * This method provides backward compatibility for the gradual migration
   * from bcrypt to Argon2id. When a user with a bcrypt hash logs in:
   * 1. The bcrypt hash is verified
   * 2. If valid, a new Argon2id hash is generated
   * 3. The caller can update the database with the new hash
   *
   * @param storedHash - The stored password hash (bcrypt or Argon2id)
   * @param password - The plain text password to verify
   * @returns Object containing validity and optional new hash for upgrade
   */
  async verifyAndUpgrade(
    storedHash: string,
    password: string,
  ): Promise<{ valid: boolean; newHash?: string; upgraded?: boolean }> {
    // Check if already using Argon2id
    if (storedHash.startsWith('$argon2')) {
      const valid = await this.verify(storedHash, password);
      return { valid };
    }

    // Check if it's a bcrypt hash (starts with $2a$, $2b$, or $2y$)
    if (storedHash.startsWith('$2')) {
      try {
        const valid = await bcrypt.compare(password, storedHash);

        if (valid) {
          // Generate new Argon2id hash for automatic upgrade
          const newHash = await this.hash(password);
          this.logger.log('Password hash upgrade initiated (bcrypt -> Argon2id)');
          return { valid: true, newHash, upgraded: true };
        }

        return { valid: false };
      } catch (error) {
        this.logger.error('Bcrypt verification failed', error);
        return { valid: false };
      }
    }

    // Unknown hash format
    this.logger.warn('Unknown hash format encountered during password verification');
    return { valid: false };
  }

  /**
   * Check if a hash needs to be upgraded to Argon2id.
   *
   * @param hash - The stored password hash
   * @returns True if the hash should be upgraded
   */
  needsUpgrade(hash: string): boolean {
    // bcrypt hashes start with $2a$, $2b$, or $2y$
    return hash.startsWith('$2');
  }
}
