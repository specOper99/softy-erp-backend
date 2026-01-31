import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
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
import { MfaTokenService } from './services/mfa-token.service';
import { MfaService } from './services/mfa.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { RequestContext, TokenPayload, TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Timing attack mitigation:
   * Generate a unique dummy hash at service instantiation using random bytes.
   * This prevents attackers from pre-computing timing patterns and ensures
   * consistent response times regardless of user existence.
   */
  private readonly dummyPasswordHash: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly tokenService: TokenService,
    private readonly mfaService: MfaService,
    private readonly sessionService: SessionService,
    private readonly passwordService: PasswordService,
    private readonly mfaTokenService: MfaTokenService,
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationRepository: Repository<EmailVerificationToken>,
    private readonly dataSource: DataSource,
    private readonly lockoutService: AccountLockoutService,
    private readonly mailService: MailService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    // Generate a unique dummy hash at startup using cryptographically secure random bytes
    // This is never stored or exposed - it's solely for timing attack mitigation
    const randomPassword = crypto.randomBytes(32).toString('hex');
    // Use synchronous hash generation at startup (one-time cost)
    this.dummyPasswordHash = bcrypt.hashSync(randomPassword, 10);
  }

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

      await this.sendVerificationEmail(user);

      await queryRunner.commitTransaction();

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
    // CRITICAL SECURITY: equalize auth response timing to reduce user enumeration via latency.
    // This applies to both success and failure paths.
    const startedAtMs = Date.now();
    const minResponseMs = 100;

    try {
      const lockoutStatus = await this.lockoutService.isLockedOut(loginDto.email);
      if (lockoutStatus.locked) {
        const remainingSecs = Math.ceil((lockoutStatus.remainingMs || 0) / 1000);
        throw new UnauthorizedException(`Account temporarily locked. Try again in ${remainingSecs} seconds.`);
      }

      const user = await this.usersService.findByEmailWithMfaSecretGlobal(loginDto.email);
      // Find user globally by email to determine tenant
      if (!user) {
        await this.lockoutService.recordFailedAttempt(loginDto.email);
        // Timing Attack Mitigation:
        // Perform a dummy bcrypt comparison so the response time roughly matches valid users.
        // This prevents attackers from easily enumerating valid email addresses by measuring response latency.
        // The dummyPasswordHash is generated uniquely at service startup from random bytes.
        await bcrypt.compare(loginDto.password, this.dummyPasswordHash);
        throw new UnauthorizedException('Invalid credentials');
      }

      const tenantId = user.tenantId;
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      const isPasswordValid = await this.usersService.validatePassword(user, loginDto.password);
      if (!isPasswordValid) {
        await this.lockoutService.recordFailedAttempt(loginDto.email);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.isMfaEnabled) {
        const tempToken = await this.mfaTokenService.createTempToken({
          userId: user.id,
          tenantId,
          rememberMe: !!loginDto.rememberMe,
        });

        return { requiresMfa: true, tempToken };
      }

      await this.lockoutService.clearAttempts(loginDto.email);

      if (context?.ipAddress) {
        this.sessionService.checkSuspiciousActivity(user.id, context.ipAddress, user.email).catch((error) => {
          const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
          this.logger.error(`Suspicious activity check failed: ${message}`);
        });
      }

      return this.generateAuthResponse(user, context, loginDto.rememberMe);
    } finally {
      const elapsedMs = Date.now() - startedAtMs;
      const remainingMs = minResponseMs - elapsedMs;
      if (remainingMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
      }
    }
  }

  async generateMfaSecret(user: User): Promise<MfaResponseDto> {
    return this.mfaService.generateMfaSecret(user);
  }

  async verifyMfaTotp(tempToken: string, code: string, context?: RequestContext): Promise<AuthResponseDto> {
    return this.verifyMfaCommon(
      tempToken,
      code,
      context,
      async (userId) => {
        const user = await this.usersService.findByIdWithMfaSecret(userId);
        if (!user || !user.mfaSecret) return null;
        return user;
      },
      (user, c) => this.mfaService.verifyTotp(user.mfaSecret, c),
      'Invalid MFA code',
    );
  }

  async verifyMfaRecovery(tempToken: string, code: string, context?: RequestContext): Promise<AuthResponseDto> {
    return this.verifyMfaCommon(
      tempToken,
      code,
      context,
      (userId) => this.usersService.findByIdWithRecoveryCodesGlobal(userId),
      (user, c) => this.mfaService.verifyRecoveryCode(user, c),
      'Invalid recovery code',
    );
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
          const now = Date.now();
          const lastUsedAtMs = storedToken.lastUsedAt?.getTime();
          const recentRevocationGraceMs = 5_000;

          const contextUserAgent = context?.userAgent?.substring(0, 200);
          const userAgentMatches =
            !!contextUserAgent && !!storedToken.userAgent ? storedToken.userAgent === contextUserAgent : false;
          const ipMatches =
            !!context?.ipAddress && !!storedToken.ipAddress ? storedToken.ipAddress === context.ipAddress : false;

          const isLikelyConcurrentRefresh =
            typeof lastUsedAtMs === 'number' &&
            now - lastUsedAtMs >= 0 &&
            now - lastUsedAtMs <= recentRevocationGraceMs &&
            userAgentMatches &&
            ipMatches;

          if (!isLikelyConcurrentRefresh) {
            this.logger.warn({
              message: 'Possible token reuse detected',
              userId: storedToken.userId,
              tokenId: storedToken.id,
              ipAddress: context?.ipAddress,
              userAgent: context?.userAgent,
            });
            await manager.update(RefreshToken, { userId: storedToken.userId, isRevoked: false }, { isRevoked: true });
          }
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

      return this.tokenService.generateTokens(user, context, false, (userId, userAgent, ipAddress, userEmail) => {
        this.sessionService.checkNewDevice(userId, userAgent, ipAddress, userEmail).catch((error) => {
          const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
          this.logger.error(`New device check failed: ${message}`);
        });
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
    const tokens = await this.tokenService.generateTokens(
      user,
      context,
      rememberMe,
      (userId, userAgent, ipAddress, userEmail) => {
        this.sessionService.checkNewDevice(userId, userAgent, ipAddress, userEmail).catch((error) => {
          const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
          this.logger.error(`New device check failed: ${message}`);
        });
      },
    );

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

  private async verifyMfaCommon(
    tempToken: string,
    code: string,
    context: RequestContext | undefined,
    fetchUser: (userId: string) => Promise<User | null>,
    verifyFn: (user: User, code: string) => Promise<boolean> | boolean,
    errorMessage: string,
  ): Promise<AuthResponseDto> {
    const tempPayload = await this.mfaTokenService.getTempToken(tempToken);
    if (!tempPayload) {
      throw new UnauthorizedException('MFA session expired or invalid. Please login again.');
    }

    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('tenants.tenant_id_required');
    }

    if (tempPayload.tenantId !== tenantId) {
      throw new UnauthorizedException('Invalid MFA session tenant');
    }

    const user = await fetchUser(tempPayload.userId);
    if (!user || user.tenantId !== tenantId) {
      throw new UnauthorizedException('User not found');
    }

    // Check specific conditions if needed (like mfaSecret existence) inside the fetchUser or verifyFn
    // But for basic user validity, the above is enough.

    const isValid = await verifyFn(user, code);
    if (!isValid) {
      await this.lockoutService.recordFailedAttempt(user.email);
      throw new UnauthorizedException(errorMessage);
    }

    await this.mfaTokenService.consumeTempToken(tempToken);
    await this.lockoutService.clearAttempts(user.email);

    if (context?.ipAddress) {
      this.sessionService.checkSuspiciousActivity(user.id, context.ipAddress, user.email).catch((error) => {
        const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
        this.logger.error(`Suspicious activity check failed: ${message}`);
      });
    }

    return this.generateAuthResponse(user, context, tempPayload.rememberMe);
  }
}
