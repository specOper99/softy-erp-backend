import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { PlatformSession } from '../entities/platform-session.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { RuntimeFailure } from '../../../common/errors/runtime-failure';

export interface PlatformTokenPayload {
  sub: string;
  userId: string;
  email: string;
  platformRole: string;
  sessionId: string;
  aud: string;
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    @InjectRepository(PlatformSession)
    private readonly platformSessionRepository: Repository<PlatformSession>,
  ) {
    const jwtSecret = configService.get<string>('PLATFORM_JWT_SECRET');
    if (!jwtSecret) {
      throw new RuntimeFailure('PLATFORM_JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      // Don't verify audience in the strategy constructor, do it in validate()
    });
  }

  async validate(payload: PlatformTokenPayload) {
    // Verify this is a platform token
    if (payload.aud !== 'platform') {
      throw new UnauthorizedException('auth.invalid_token_audience');
    }

    // Load platform user
    const user = await this.platformUserRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('auth.user_not_found_or_inactive');
    }

    const session = await this.platformSessionRepository.findOne({
      where: { id: payload.sessionId, userId: user.id },
    });

    if (!session) {
      throw new UnauthorizedException('auth.invalid_session');
    }

    if (session.isRevoked) {
      throw new UnauthorizedException('auth.session_revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('auth.session_expired');
    }

    if (user.mfaEnabled && !session.mfaVerified) {
      throw new UnauthorizedException('auth.mfa_required');
    }

    // Return user object with platformRole for guards
    return {
      id: user.id,
      email: user.email,
      platformRole: user.role,
      sessionId: payload.sessionId,
      userId: user.id,
      aud: 'platform', // Important: PlatformContextGuard checks this!
    };
  }
}
