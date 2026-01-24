import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { TokenPayload } from '../services/token.service';

import type { Request } from 'express';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    const rawAlgorithms = configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
    const parsed = rawAlgorithms
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

    const unique = Array.from(new Set(parsed));
    if (unique.length !== 1) {
      throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
    }

    const algorithm = unique[0] ?? 'HS256';

    const secretOrKey = (() => {
      if (algorithm === 'RS256') {
        const publicKey = configService.get<string>('JWT_PUBLIC_KEY');
        if (!publicKey) {
          throw new Error('JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS includes RS256');
        }
        return publicKey;
      }

      const hsSecret = configService.get<string>('auth.jwtSecret');
      if (!hsSecret) {
        throw new Error('JWT_SECRET is not defined');
      }
      return hsSecret;
    })();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
      algorithms: [algorithm],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (isBlacklisted) {
        return null; // Reject request
      }
    }
    return this.authService.validateUser(payload);
  }
}
