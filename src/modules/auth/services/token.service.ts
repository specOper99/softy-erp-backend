import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { LessThan, MoreThan, Not, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TokensDto } from '../dto';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

export interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  readonly accessTokenExpiresIn: number;
  readonly refreshTokenExpiresIn: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {
    this.accessTokenExpiresIn = this.configService.get<number>('auth.jwtAccessExpiresSeconds', 900);
    this.refreshTokenExpiresIn = this.configService.get<number>('auth.jwtRefreshExpiresDays', 7);
  }

  async generateTokens(
    user: User,
    context?: RequestContext,
    rememberMe?: boolean,
    onNewDevice?: (userId: string, userAgent: string, ipAddress?: string) => void,
  ): Promise<TokensDto> {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });

    const refreshToken = this.generateRefreshToken();

    await this.storeRefreshToken(user.id, refreshToken, context, rememberMe, onNewDevice);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async storeRefreshToken(
    userId: string,
    token: string,
    context?: RequestContext,
    rememberMe?: boolean,
    onNewDevice?: (userId: string, userAgent: string, ipAddress?: string) => void,
  ): Promise<RefreshToken> {
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    const durationDays = rememberMe ? 30 : this.refreshTokenExpiresIn;
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    if (context?.userAgent && onNewDevice) {
      onNewDevice(userId, context.userAgent, context.ipAddress);
    }

    const refreshToken = this.refreshTokenRepository.create({
      tokenHash,
      userId,
      expiresAt,
      userAgent: context?.userAgent?.substring(0, 500) || null,
      ipAddress: context?.ipAddress || null,
    });

    return this.refreshTokenRepository.save(refreshToken);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
  }

  async revokeToken(tokenHash: string, userId: string): Promise<void> {
    await this.refreshTokenRepository.update({ tokenHash, userId }, { isRevoked: true });
  }

  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.refreshTokenRepository.update({ userId, isRevoked: false }, { isRevoked: true });
    return result.affected || 0;
  }

  async revokeOtherSessions(userId: string, currentTokenHash: string): Promise<number> {
    const result = await this.refreshTokenRepository.update(
      {
        userId,
        isRevoked: false,
        tokenHash: Not(currentTokenHash),
      },
      { isRevoked: true },
    );
    return result.affected || 0;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    const deleted = result.affected || 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} expired refresh tokens`);
    }
    return deleted;
  }

  async getActiveSessions(userId: string): Promise<RefreshToken[]> {
    return this.refreshTokenRepository.find({
      where: {
        userId,
        isRevoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<number> {
    const result = await this.refreshTokenRepository.update(
      { id: sessionId, userId, isRevoked: false },
      { isRevoked: true },
    );
    return result.affected || 0;
  }

  async getRecentSessions(userId: string, since: Date): Promise<RefreshToken[]> {
    return this.refreshTokenRepository.find({
      where: {
        userId,
        lastUsedAt: MoreThan(since),
        isRevoked: false,
      },
      select: ['ipAddress', 'lastUsedAt'],
    });
  }

  async findPreviousLoginByUserAgent(userId: string, userAgent: string): Promise<RefreshToken | null> {
    return this.refreshTokenRepository.findOne({
      where: { userId, userAgent },
      select: ['id'],
    });
  }

  getRepository(): Repository<RefreshToken> {
    return this.refreshTokenRepository;
  }
}
