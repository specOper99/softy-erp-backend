import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformUser } from '../../domain/entities/platform-user.entity';

export interface PlatformTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface PlatformValidatedUser {
  id: string;
  email: string;
  role: string;
  aud: 'platform';
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {
    const secret = configService.getOrThrow<string>('PLATFORM_JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      audience: 'platform',
      ignoreExpiration: false,
    });
  }

  async validate(payload: PlatformTokenPayload): Promise<PlatformValidatedUser> {
    const user = await this.platformUserRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'role', 'status'],
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('common.unauthorized_plain');
    }

    return { id: user.id, email: user.email, role: user.role, aud: 'platform' };
  }
}
