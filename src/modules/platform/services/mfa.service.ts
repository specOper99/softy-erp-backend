import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

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

  /**
   * Generate MFA secret and QR code for user
   */
  async setupMFA(userId: string, userEmail: string): Promise<MFASetupResponse> {
    // Generate secret
    const secret = authenticator.generateSecret();

    // Generate OTP auth URL
    const otpauth = authenticator.keyuri(userEmail, this.APP_NAME, secret);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauth);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(8);

    this.logger.log(`MFA setup initiated for user ${userId}`);

    return {
      secret,
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
      return authenticator.verify({
        token,
        secret,
      });
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
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(providedCode: string, storedCodes: string[]): boolean {
    const normalizedCode = providedCode.toUpperCase().trim();
    return storedCodes.includes(normalizedCode);
  }

  /**
   * Remove used backup code
   */
  removeUsedBackupCode(usedCode: string, storedCodes: string[]): string[] {
    const normalizedCode = usedCode.toUpperCase().trim();
    return storedCodes.filter((code) => code !== normalizedCode);
  }
}
