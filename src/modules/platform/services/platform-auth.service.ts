import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformSession } from '../entities/platform-session.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { PlatformAction } from '../enums/platform-action.enum';
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
}

/**
 * Service for platform user authentication
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);
  private readonly SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

  constructor(
    @InjectRepository(PlatformUser)
    private readonly userRepository: Repository<PlatformUser>,
    @InjectRepository(PlatformSession)
    private readonly sessionRepository: Repository<PlatformSession>,
    private readonly jwtService: JwtService,
    private readonly passwordHashService: PasswordHashService,
    private readonly auditService: PlatformAuditService,
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

    const isPasswordValid = await this.passwordHashService.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.mfaEnabled && !dto.mfaCode) {
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
        sessionId: '',
      };
    }

    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepository.save(user);
    }

    const session = await this.createSession(user, ipAddress, userAgent, dto.deviceId, dto.deviceName);

    const accessToken = this.generateAccessToken(user, session.id);
    const refreshToken = this.generateRefreshToken(user, session.id);

    session.sessionToken = accessToken;
    session.refreshToken = refreshToken;
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
      mfaVerified: user.mfaEnabled,
      mfaVerifiedAt: user.mfaEnabled ? new Date() : null,
      expiresAt: new Date(Date.now() + this.SESSION_DURATION),
      lastActivityAt: new Date(),
      sessionToken: '',
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
}
