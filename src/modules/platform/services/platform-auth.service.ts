import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformSession } from '../entities/platform-session.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { PlatformAction } from '../enums/platform-action.enum';
import { MFAService } from './mfa.service';
import { PlatformMfaTokenService } from './platform-mfa-token.service';
import { PlatformAuditService } from './platform-audit.service';

export interface PlatformLoginInput {
  email: string;
  password: string;
  mfaCode?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface PlatformLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  mfaRequired: boolean;
  sessionId: string;
  tempToken?: string;
  backupCodesRemaining?: number;
}

/**
 * Service for platform user authentication
 */
@Injectable()
export class PlatformAuthService {
  private readonly SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

  constructor(
    @InjectRepository(PlatformUser)
    private readonly userRepository: Repository<PlatformUser>,
    @InjectRepository(PlatformSession)
    private readonly sessionRepository: Repository<PlatformSession>,
    private readonly jwtService: JwtService,
    private readonly passwordHashService: PasswordHashService,
    private readonly auditService: PlatformAuditService,
    private readonly mfaService: MFAService,
    private readonly platformMfaTokenService: PlatformMfaTokenService,
  ) {}

  async login(dto: PlatformLoginInput, ipAddress: string, userAgent: string): Promise<PlatformLoginResponse> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      select: [
        'id',
        'email',
        'fullName',
        'passwordHash',
        'role',
        'status',
        'mfaEnabled',
        'failedLoginAttempts',
        'lockedUntil',
        'ipAllowlist',
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(`Account locked until ${user.lockedUntil.toISOString()}`);
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account suspended');
    }

    if (user.ipAllowlist && user.ipAllowlist.length > 0) {
      if (!user.ipAllowlist.includes(ipAddress)) {
        throw new UnauthorizedException('IP not allowed');
      }
    }

    const passwordCheck = await this.passwordHashService.verifyAndUpgrade(user.passwordHash, dto.password);

    if (!passwordCheck.valid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Backward-compat: upgrade legacy hashes (eg bcrypt) to Argon2id.
    if (passwordCheck.upgraded && passwordCheck.newHash) {
      user.passwordHash = passwordCheck.newHash;
    }

    if (user.failedLoginAttempts > 0 || (passwordCheck.upgraded && passwordCheck.newHash)) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepository.save(user);
    }

    if (user.mfaEnabled) {
      const session = await this.createSession(user, ipAddress, userAgent, dto.deviceId, dto.deviceName);
      const tempToken = await this.platformMfaTokenService.create({
        platformUserId: user.id,
        sessionId: session.id,
        ipHash: PlatformMfaTokenService.hashIp(ipAddress),
        userAgentHash: PlatformMfaTokenService.hashUserAgent(userAgent),
      });

      return {
        accessToken: '',
        refreshToken: '',
        expiresIn: 0,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        mfaRequired: true,
        sessionId: session.id,
        tempToken,
      };
    }

    const session = await this.createSession(user, ipAddress, userAgent, dto.deviceId, dto.deviceName);

    const accessToken = this.generateAccessToken(user, session.id);
    const refreshToken = this.generateRefreshToken(user, session.id);

    session.sessionTokenHash = this.hashToken(accessToken);
    session.refreshTokenHash = this.hashToken(refreshToken);
    await this.sessionRepository.save(session);

    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    await this.userRepository.save(user);

    await this.auditService.log({
      platformUserId: user.id,
      action: PlatformAction.PLATFORM_USER_UPDATED,
      ipAddress,
      userAgent,
      additionalContext: { event: 'login_success', deviceId: dto.deviceId },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.SESSION_DURATION / 1000,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      mfaRequired: false,
      sessionId: session.id,
    };
  }

  async verifyLoginMfa(
    tempToken: string,
    code: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<PlatformLoginResponse> {
    const payload = await this.platformMfaTokenService.consume(tempToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid session');
    }

    if (payload.ipHash !== PlatformMfaTokenService.hashIp(ipAddress)) {
      throw new UnauthorizedException('Invalid session');
    }
    if (payload.userAgentHash !== PlatformMfaTokenService.hashUserAgent(userAgent)) {
      throw new UnauthorizedException('Invalid session');
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sessionId, userId: payload.platformUserId },
    });

    if (!session || session.isRevoked || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.platformUserId },
      select: ['id', 'email', 'fullName', 'role', 'status', 'mfaEnabled', 'mfaSecret', 'mfaRecoveryCodes'],
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid session');
    }

    if (!user.mfaEnabled) {
      throw new UnauthorizedException('MFA not enabled');
    }

    const isTotpValid = this.mfaService.verifyToken(user.mfaSecret || '', code);
    let backupCodesRemaining: number | undefined;

    if (!isTotpValid) {
      const isBackupValid = await this.mfaService.verifyBackupCode(code, user.mfaRecoveryCodes || []);
      if (!isBackupValid) {
        throw new UnauthorizedException('Invalid MFA code');
      }

      user.mfaRecoveryCodes = await this.mfaService.removeUsedBackupCode(code, user.mfaRecoveryCodes || []);
      await this.userRepository.save(user);
      backupCodesRemaining = user.mfaRecoveryCodes.length;
    }

    session.mfaVerified = true;
    session.mfaVerifiedAt = new Date();
    session.lastActivityAt = new Date();

    const accessToken = this.generateAccessToken(user, session.id);
    const refreshToken = this.generateRefreshToken(user, session.id);
    session.sessionTokenHash = this.hashToken(accessToken);
    session.refreshTokenHash = this.hashToken(refreshToken);
    await this.sessionRepository.save(session);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.SESSION_DURATION / 1000,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      mfaRequired: false,
      sessionId: session.id,
      ...(backupCodesRemaining !== undefined ? { backupCodesRemaining } : {}),
    } as PlatformLoginResponse;
  }

  async logout(sessionId: string, platformUserId: string): Promise<void> {
    await this.sessionRepository.update(
      { id: sessionId, userId: platformUserId },
      {
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy: platformUserId,
        revokedReason: 'User logout',
      },
    );
  }

  async revokeAllSessions(userId: string, revokedBy: string, reason: string): Promise<number> {
    const result = await this.sessionRepository.update(
      { userId, isRevoked: false },
      {
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason,
      },
    );

    return result.affected || 0;
  }

  private async createSession(
    user: PlatformUser,
    ipAddress: string,
    userAgent: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<PlatformSession> {
    const session = this.sessionRepository.create({
      userId: user.id,
      ipAddress,
      userAgent,
      deviceId: deviceId || null,
      deviceName: deviceName || null,
      mfaVerified: !user.mfaEnabled,
      mfaVerifiedAt: !user.mfaEnabled ? new Date() : null,
      expiresAt: new Date(Date.now() + this.SESSION_DURATION),
      lastActivityAt: new Date(),
      sessionTokenHash: null,
      refreshTokenHash: null,
    });

    return this.sessionRepository.save(session);
  }

  private generateAccessToken(user: PlatformUser, sessionId: string): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        userId: user.id,
        email: user.email,
        platformRole: user.role,
        sessionId,
        aud: 'platform',
      },
      { expiresIn: this.SESSION_DURATION / 1000 },
    );
  }

  private generateRefreshToken(user: PlatformUser, sessionId: string): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        sessionId,
        type: 'refresh',
        aud: 'platform',
      },
      { expiresIn: 30 * 24 * 60 * 60 },
    );
  }

  private async handleFailedLogin(user: PlatformUser): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }

    await this.userRepository.save(user);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
