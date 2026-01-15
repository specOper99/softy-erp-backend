import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { authenticator } from 'otplib';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { TenantsService } from '../tenants/tenants.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { UsersService } from '../users/services/users.service';
import { AuthResponseDto, LoginDto, MfaResponseDto, RegisterDto, TokensDto } from './dto';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AccountLockoutService } from './services/account-lockout.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { RequestContext, TokenPayload, TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly tokenService: TokenService,
    private readonly mfaService: MfaService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationRepository: Repository<EmailVerificationToken>,
    private readonly dataSource: DataSource,
    private readonly lockoutService: AccountLockoutService,
    private readonly mailService: MailService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  // A valid bcrypt hash (cost 10) to simulate password check time
  // This hash corresponds to 'password' or similar, but we never expect it to match
  private readonly DUMMY_PASSWORD_HASH = '$2b$10$nOUIs5kJ7naTuTFkBy1veuK0kSx.BNfviYuZFt.vl5vU1KbGytp.6';

  async register(registerDto: RegisterDto, context?: RequestContext): Promise<AuthResponseDto> {
    const slug = registerDto.companyName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/(^-)|(-$)/g, '');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let tenant;
      try {
        tenant = await this.tenantsService.createWithManager(queryRunner.manager, {
          name: registerDto.companyName,
          slug,
        });
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
          throw new ConflictException('Tenant with this name or slug already exists');
        }
        throw error;
      }

      const tenantId = tenant.id;

      const existingUser = await this.usersService.findByEmailGlobal(registerDto.email);
      if (existingUser) {
        throw new ConflictException('auth.email_already_registered');
      }

      const user = await this.usersService.createWithManager(queryRunner.manager, {
        email: registerDto.email,
        password: registerDto.password,
        role: Role.ADMIN,
        tenantId: tenantId,
      });

      await queryRunner.commitTransaction();

      this.sendVerificationEmail(user).catch((err: Error) =>
        this.logger.error(`Failed to send verification email: ${err.message}`),
      );

      return this.generateAuthResponse(user, context);
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23505') {
        throw new BadRequestException('auth.email_already_registered');
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  async login(loginDto: LoginDto, context?: RequestContext): Promise<AuthResponseDto> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('tenants.tenant_id_required');
    }

    const lockoutStatus = await this.lockoutService.isLockedOut(loginDto.email);
    if (lockoutStatus.locked) {
      const remainingSecs = Math.ceil((lockoutStatus.remainingMs || 0) / 1000);
      throw new UnauthorizedException(`Account temporarily locked. Try again in ${remainingSecs} seconds.`);
    }

    const user = await this.usersService.findByEmailWithMfaSecret(loginDto.email, tenantId);
    if (!user) {
      await this.lockoutService.recordFailedAttempt(loginDto.email);
      // Timing Attack Mitigation:
      // Perform a dummy bcrypt comparison so the response time roughly matches valid users.
      // This prevents attackers from easily enumerating valid email addresses by measuring response latency.
      await bcrypt.compare(loginDto.password, this.DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await this.usersService.validatePassword(user, loginDto.password);
    if (!isPasswordValid) {
      await this.lockoutService.recordFailedAttempt(loginDto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const mfaResult = await this.verifyMfaIfEnabled(user, loginDto.code, loginDto.email);
    if (mfaResult) {
      return mfaResult;
    }

    await this.lockoutService.clearAttempts(loginDto.email);

    if (context?.ipAddress) {
      void this.sessionService.checkSuspiciousActivity(user.id, context.ipAddress);
    }

    return this.generateAuthResponse(user, context, loginDto.rememberMe);
  }

  private async verifyMfaIfEnabled(
    user: User,
    code: string | undefined,
    email: string,
  ): Promise<AuthResponseDto | null> {
    if (!user.isMfaEnabled) {
      return null;
    }

    if (!code) {
      return { requiresMfa: true };
    }

    let isValid = false;
    try {
      isValid = authenticator.verify({
        token: code,
        secret: user.mfaSecret,
      });
    } catch {
      // TOTP verification failed, will try recovery code next
    }

    if (!isValid) {
      const isRecoveryCodeValid = await this.mfaService.verifyRecoveryCode(user, code);
      if (!isRecoveryCodeValid) {
        await this.lockoutService.recordFailedAttempt(email);
        throw new UnauthorizedException('Invalid MFA code or recovery code');
      }
    }

    return null;
  }

  async generateMfaSecret(user: User): Promise<MfaResponseDto> {
    return this.mfaService.generateMfaSecret(user);
  }

  async enableMfa(user: User, code: string): Promise<string[]> {
    return this.mfaService.enableMfa(user, code);
  }

  async disableMfa(user: User): Promise<void> {
    return this.mfaService.disableMfa(user);
  }

  async generateRecoveryCodes(user: User): Promise<string[]> {
    return this.mfaService.generateRecoveryCodes(user);
  }

  async verifyRecoveryCode(user: User, code: string): Promise<boolean> {
    return this.mfaService.verifyRecoveryCode(user, code);
  }

  async getRemainingRecoveryCodes(user: User): Promise<number> {
    return this.mfaService.getRemainingRecoveryCodes(user);
  }

  async refreshTokens(refreshToken: string, context?: RequestContext): Promise<TokensDto> {
    const tokenHash = this.tokenService.hashToken(refreshToken);

    return this.dataSource.transaction(async (manager) => {
      const storedToken = await manager.findOne(RefreshToken, {
        where: { tokenHash },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (!storedToken.isValid()) {
        if (storedToken.isRevoked) {
          this.logger.warn({
            message: 'Possible token reuse detected',
            userId: storedToken.userId,
            tokenId: storedToken.id,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
          });
          await manager.update(RefreshToken, { userId: storedToken.userId, isRevoked: false }, { isRevoked: true });
        }
        throw new UnauthorizedException('Refresh token expired or revoked');
      }

      const user = storedToken.user;
      if (!user?.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      storedToken.isRevoked = true;
      storedToken.lastUsedAt = new Date();
      await manager.save(storedToken);

      return this.tokenService.generateTokens(user, context, false, (userId, userAgent, ipAddress) => {
        void this.sessionService.checkNewDevice(userId, userAgent, ipAddress);
      });
    });
  }

  async logout(userId: string, refreshToken?: string, accessToken?: string): Promise<void> {
    if (accessToken) {
      // Blacklist access token
      await this.tokenBlacklistService.blacklist(accessToken, this.tokenService.accessTokenExpiresIn);
    }

    if (refreshToken) {
      const tokenHash = this.tokenService.hashToken(refreshToken);
      await this.tokenService.revokeToken(tokenHash, userId);
    } else {
      await this.tokenService.revokeAllUserTokens(userId);
    }
  }

  async logoutAllSessions(userId: string): Promise<number> {
    return this.tokenService.revokeAllUserTokens(userId);
  }

  async validateUser(payload: TokenPayload): Promise<User> {
    const user = await this.usersService.findOne(payload.sub);
    if (!user?.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!payload.tenantId || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Invalid token tenant');
    }
    return user;
  }

  async getActiveSessions(userId: string): Promise<RefreshToken[]> {
    return this.sessionService.getActiveSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    return this.sessionService.revokeSession(userId, sessionId);
  }

  async revokeOtherSessions(userId: string, currentRefreshToken: string): Promise<number> {
    return this.sessionService.revokeOtherSessions(userId, currentRefreshToken);
  }

  async cleanupExpiredTokens(): Promise<number> {
    return this.tokenService.cleanupExpiredTokens();
  }

  async forgotPassword(email: string): Promise<void> {
    return this.passwordService.forgotPassword(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    return this.passwordService.resetPassword(token, newPassword, (userId) =>
      this.logoutAllSessions(userId).then(() => {}),
    );
  }

  async verifyEmail(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const verificationToken = await this.emailVerificationRepository.findOne({
      where: { tokenHash, used: false },
    });

    if (!verificationToken) {
      throw new UnauthorizedException('Invalid verification token');
    }

    if (verificationToken.isExpired()) {
      throw new UnauthorizedException('Verification token has expired');
    }

    const user = await this.usersService.findByEmailGlobal(verificationToken.email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    verificationToken.used = true;
    await this.emailVerificationRepository.save(verificationToken);

    await this.usersService.update(user.id, { emailVerified: true });

    return true;
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmailGlobal(email);
    if (!user) {
      return;
    }

    if (user.emailVerified) {
      throw new ConflictException('Email is already verified');
    }

    await this.sendVerificationEmail(user);
  }

  private async generateAuthResponse(
    user: User,
    context?: RequestContext,
    rememberMe?: boolean,
  ): Promise<AuthResponseDto> {
    const tokens = await this.tokenService.generateTokens(user, context, rememberMe, (userId, userAgent, ipAddress) => {
      void this.sessionService.checkNewDevice(userId, userAgent, ipAddress);
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.emailVerificationRepository.save({
      email: user.email,
      tokenHash,
      expiresAt,
    });

    await this.mailService.queueEmailVerification({
      email: user.email,
      name: user.email,
      token,
    });
  }
}
