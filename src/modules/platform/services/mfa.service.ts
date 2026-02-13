import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformUser } from '../entities/platform-user.entity';

export interface MFASetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MFAVerifyInput {
  userId: string;
  code: string;
}

/**
 * Service for Multi-Factor Authentication (MFA) using TOTP
 */
@Injectable()
export class MFAService {
  private readonly logger = new Logger(MFAService.name);
  private readonly APP_NAME = 'Platform Admin';

  constructor(
    @InjectRepository(PlatformUser)
    private readonly userRepository: Repository<PlatformUser>,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  /**
   * Generate MFA secret and QR code for user
   */
  async setupMFA(userId: string, userEmail: string): Promise<MFASetupResponse> {
    // Generate secret
    const secret = new OTPAuth.Secret({ size: 20 });

    // Generate TOTP instance
    const totp = new OTPAuth.TOTP({
      issuer: this.APP_NAME,
      label: userEmail,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    // Generate OTP auth URL
    const otpauth = totp.toString();

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauth);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(8);

    this.logger.log(`MFA setup initiated for user ${userId}`);

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Verify MFA token
   */
  verifyToken(secret: string, token: string): boolean {
    try {
      // Verify TOTP token with 30-second window
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token, window: 1 });
      return delta !== null;
    } catch (error) {
      this.logger.error(`MFA verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Verify MFA code for user login
   */
  verifyMFACode(input: MFAVerifyInput, userSecret: string): boolean {
    const isValid = this.verifyToken(userSecret, input.code);

    if (!isValid) {
      this.logger.warn(`Invalid MFA code attempt for user ${input.userId}`);
      throw new UnauthorizedException('Invalid MFA code');
    }

    return true;
  }

  /**
   * Generate backup codes for MFA recovery
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = randomBytes(5).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(providedCode: string, storedCodes: string[]): Promise<boolean> {
    const normalizedCode = providedCode.toUpperCase().trim();

    for (const storedCode of storedCodes) {
      if (await this.passwordHashService.verify(storedCode, normalizedCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Remove used backup code
   */
  async removeUsedBackupCode(usedCode: string, storedCodes: string[]): Promise<string[]> {
    const normalizedCode = usedCode.toUpperCase().trim();

    for (let i = 0; i < storedCodes.length; i++) {
      const storedCode = storedCodes[i];
      if (!storedCode) {
        continue;
      }

      if (await this.passwordHashService.verify(storedCode, normalizedCode)) {
        return storedCodes.filter((_, idx) => idx !== i);
      }
    }

    return storedCodes;
  }
  /**
   * Get platform user by ID
   */
  async getUserById(userId: string): Promise<PlatformUser> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Get platform user with specific fields
   */
  async getUserWithFields(userId: string, fields: Array<keyof PlatformUser>): Promise<PlatformUser> {
    const selectFields = ['id', ...fields] as Array<keyof PlatformUser>;
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: selectFields,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Save MFA setup for user
   */
  async saveMfaSetup(userId: string, secret: string, backupCodes: string[]): Promise<void> {
    const user = await this.getUserById(userId);
    const hashedCodes = await Promise.all(
      backupCodes.map((code) => this.passwordHashService.hash(code.toUpperCase().trim())),
    );
    user.mfaSecret = secret;
    user.mfaRecoveryCodes = hashedCodes;
    await this.userRepository.save(user);
  }

  /**
   * Enable MFA for user
   */
  async enableMfa(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    user.mfaEnabled = true;
    await this.userRepository.save(user);
  }

  /**
   * Disable MFA for user with password verification
   */
  async disableMfa(userId: string, password: string): Promise<void> {
    const user = await this.getUserWithFields(userId, ['passwordHash', 'mfaEnabled']);

    // Verify password before disabling MFA
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Incorrect password. MFA cannot be disabled.');
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaRecoveryCodes = [];
    await this.userRepository.save(user);
  }

  /**
   * Update backup codes for user
   */
  async updateBackupCodes(userId: string, backupCodes: string[]): Promise<void> {
    const user = await this.getUserById(userId);
    user.mfaRecoveryCodes = await Promise.all(
      backupCodes.map((code) => this.passwordHashService.hash(code.toUpperCase().trim())),
    );
    await this.userRepository.save(user);
  }
}
