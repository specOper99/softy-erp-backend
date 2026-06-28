/** Centralized Argon2id hashing with bcrypt upgrade path. */
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { Counter, register } from 'prom-client';
import { toErrorMessage } from '../utils/error.util';

function getOrCreateCounter(name: string, help: string): Counter<string> {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Counter<string>;
  return new Counter({ name, help });
}

const bcryptVerifiedCounter = getOrCreateCounter(
  'softy_password_hash_bcrypt_verified_total',
  'Number of times a bcrypt-format hash has been verified during login. Goes flat once all users have rotated to Argon2id.',
);

const bcryptUpgradedCounter = getOrCreateCounter(
  'softy_password_hash_bcrypt_upgraded_total',
  'Number of bcrypt hashes successfully verified and upgraded to Argon2id.',
);

const isTestEnv = () =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined || process.argv.includes('--runInBand');

@Injectable()
export class PasswordHashService {
  private readonly logger = new Logger(PasswordHashService.name);

  private readonly ARGON2_OPTIONS: argon2.Options = isTestEnv()
    ? { type: argon2.argon2id, memoryCost: 256, timeCost: 1, parallelism: 1 }
    : { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      this.logger.warn(`Password verification error: ${toErrorMessage(error)}`);
      return false;
    }
  }

  async verifyAndUpgrade(
    storedHash: string,
    password: string,
  ): Promise<{ valid: boolean; newHash?: string; upgraded?: boolean }> {
    if (storedHash.startsWith('$argon2')) {
      return { valid: await this.verify(storedHash, password) };
    }

    if (storedHash.startsWith('$2')) {
      bcryptVerifiedCounter.inc();
      try {
        const valid = await bcrypt.compare(password, storedHash);
        if (!valid) return { valid: false };
        const newHash = await this.hash(password);
        bcryptUpgradedCounter.inc();
        this.logger.log('Password hash upgrade initiated (bcrypt -> Argon2id)');
        return { valid: true, newHash, upgraded: true };
      } catch (error) {
        this.logger.error('Bcrypt verification failed', error);
        return { valid: false };
      }
    }

    this.logger.warn('Unknown hash format encountered during password verification');
    return { valid: false };
  }

  needsUpgrade(hash: string): boolean {
    return hash.startsWith('$2');
  }
}
