import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { MfaResponseDto } from '../dto';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async generateMfaSecret(user: User): Promise<MfaResponseDto> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'softY ERP', secret);
    const qrCodeUrl = await toDataURL(otpauthUrl);

    await this.usersService.updateMfaSecret(user.id, secret, false);

    return {
      secret,
      qrCodeUrl,
    };
  }

  async enableMfa(user: User, code: string): Promise<string[]> {
    const userWithSecret = await this.usersService.findByEmailWithMfaSecret(user.email, user.tenantId);

    if (!userWithSecret || !userWithSecret.mfaSecret) {
      throw new BadRequestException('auth.mfa_setup_not_started');
    }

    let isValid = false;
    try {
      isValid = authenticator.verify({
        token: code,
        secret: userWithSecret.mfaSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid MFA code');
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.usersService.updateMfaSecret(user.id, userWithSecret.mfaSecret, true);

    const recoveryCodes = await this.generateRecoveryCodes(user);

    return recoveryCodes;
  }

  async disableMfa(user: User): Promise<void> {
    await this.usersService.updateMfaSecret(user.id, null, false);
    await this.usersService.updateMfaRecoveryCodes(user.id, []);
  }

  async generateRecoveryCodes(user: User): Promise<string[]> {
    const codes: string[] = [];

    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }

    // Use Argon2id for recovery code hashing (more efficient than bcrypt for bulk operations)
    const hashedCodes = await Promise.all(codes.map((code) => this.passwordHashService.hash(code)));

    await this.usersService.updateMfaRecoveryCodes(user.id, hashedCodes);

    this.logger.log({
      message: 'MFA recovery codes generated',
      userId: user.id,
      tenantId: user.tenantId,
    });

    return codes;
  }

  async verifyRecoveryCode(user: User, code: string): Promise<boolean> {
    const userWithCodes = await this.usersService.findByIdWithRecoveryCodes(user.id);

    if (!userWithCodes || !userWithCodes.mfaRecoveryCodes || userWithCodes.mfaRecoveryCodes.length === 0) {
      return false;
    }

    for (const hashedCode of userWithCodes.mfaRecoveryCodes) {
      const isValid = await this.passwordHashService.verify(hashedCode, code);
      if (isValid) {
        const updatedCodes = userWithCodes.mfaRecoveryCodes.filter((c) => c !== hashedCode);
        await this.usersService.updateMfaRecoveryCodes(user.id, updatedCodes);

        this.logger.log({
          message: 'MFA recovery code used',
          userId: user.id,
          tenantId: user.tenantId,
          remaining: updatedCodes.length,
        });

        return true;
      }
    }

    return false;
  }

  async getRemainingRecoveryCodes(user: User): Promise<number> {
    const userWithCodes = await this.usersService.findByIdWithRecoveryCodes(user.id);
    return userWithCodes?.mfaRecoveryCodes?.length || 0;
  }

  verifyTotp(secret: string, token: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      this.logger.debug(`TOTP verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
}
