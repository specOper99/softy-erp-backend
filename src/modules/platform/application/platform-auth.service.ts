import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { Repository } from 'typeorm';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { PlatformUser } from '../domain/entities/platform-user.entity';
import { MFAService } from './mfa.service';
import { PlatformAuthResponseDto, PlatformTokensDto } from '../api/dto';
import { PlatformRefreshToken } from '../domain/entities/platform-refresh-token.entity';

export interface PlatformRequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class PlatformAuthService {
  readonly accessTokenExpiresIn: number;
  readonly refreshTokenExpiresInDays: number;

  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    @InjectRepository(PlatformRefreshToken)
    private readonly refreshTokenRepository: Repository<PlatformRefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordHashService: PasswordHashService,
    private readonly mfaService: MFAService,
  ) {
    this.accessTokenExpiresIn = this.configService.get<number>('JWT_ACCESS_EXPIRES_SECONDS', 900);
    this.refreshTokenExpiresInDays = this.configService.get<number>('JWT_REFRESH_EXPIRES_DAYS', 7);
  }

  async login(email: string, password: string, context?: PlatformRequestContext): Promise<PlatformAuthResponseDto> {
    const user = await this.platformUserRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('auth.invalid_credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('auth.account_deactivated');
    }

    const isPasswordValid = await this.passwordHashService.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('auth.invalid_credentials');
    }

    const tokens = await this.generateTokens(user, context);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async refreshTokens(rawRefreshToken: string, context?: PlatformRequestContext): Promise<PlatformTokensDto> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!storedToken || !storedToken.isValid()) {
      throw new UnauthorizedException('auth.invalid_refresh_token');
    }

    const user = await this.platformUserRepository.findOne({
      where: { id: storedToken.userId },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('auth.invalid_refresh_token');
    }

    // Revoke old token (rotation)
    storedToken.isRevoked = true;
    await this.refreshTokenRepository.save(storedToken);

    return this.generateTokens(user, context);
  }

  async getSession(userId: string): Promise<{
    id: string;
    email: string;
    fullName: string;
    role: string;
  } | null> {
    const user = await this.platformUserRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'fullName', 'role', 'status'],
    });

    if (!user || user.status !== 'active') {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update({ tokenHash, userId }, { isRevoked: true });
    }
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.refreshTokenRepository.update({ userId, isRevoked: false }, { isRevoked: true });
    return result.affected || 0;
  }

  async verifyMfaLogin(
    tempToken: string,
    code: string,
    context?: PlatformRequestContext,
  ): Promise<PlatformAuthResponseDto> {
    const platformSecret = this.configService.getOrThrow<string>('PLATFORM_JWT_SECRET');
    let userId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(tempToken, {
        secret: platformSecret,
        audience: 'platform',
      });
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('auth.invalid_mfa_token');
    }

    const user = await this.platformUserRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'fullName', 'role', 'status', 'mfaEnabled', 'mfaSecret'],
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('auth.invalid_user');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('auth.mfa_not_enabled');
    }

    const isValid = this.mfaService.verifyToken(user.mfaSecret, code);
    if (!isValid) {
      throw new UnauthorizedException('auth.invalid_mfa_code');
    }

    return this.generateTokensForUser(userId, context);
  }

  async generateTokensForUser(userId: string, context?: PlatformRequestContext): Promise<PlatformAuthResponseDto> {
    const user = await this.platformUserRepository.findOne({
      where: { id: userId },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('auth.invalid_user');
    }

    const tokens = await this.generateTokens(user, context);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  private async generateTokens(user: PlatformUser, context?: PlatformRequestContext): Promise<PlatformTokensDto> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const platformSecret = this.configService.getOrThrow<string>('PLATFORM_JWT_SECRET');

    const accessToken = this.jwtService.sign(payload, {
      secret: platformSecret,
      expiresIn: this.accessTokenExpiresIn,
      audience: 'platform',
    });

    const refreshToken = this.generateRefreshToken();
    await this.storeRefreshToken(user.id, refreshToken, context);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async storeRefreshToken(
    userId: string,
    token: string,
    context?: PlatformRequestContext,
  ): Promise<PlatformRefreshToken> {
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiresInDays);

    const refreshToken = this.refreshTokenRepository.create({
      tokenHash,
      userId,
      expiresAt,
      userAgent: context?.userAgent?.substring(0, 200) || null,
      ipAddress: context?.ipAddress || null,
    });

    return this.refreshTokenRepository.save(refreshToken);
  }
}
