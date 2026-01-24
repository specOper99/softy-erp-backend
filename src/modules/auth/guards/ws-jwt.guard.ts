import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from '../auth.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { TokenPayload } from '../services/token.service';

interface SocketData {
  user?: TokenPayload;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromHandshake(client);

      if (!token) {
        throw new WsException('Unauthorized');
      }

      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (isBlacklisted) {
        throw new WsException('Unauthorized');
      }

      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.getJwtSecretOrKey(),
        algorithms: [this.getAllowedJwtAlgorithm()],
      });

      await this.authService.validateUser(payload);

      (client.data as SocketData).user = payload;

      return true;
    } catch (error) {
      this.logger.debug(
        `WS JWT auth denied: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
      );
      throw new WsException('Unauthorized');
    }
  }

  private getAllowedJwtAlgorithm(): 'HS256' | 'RS256' {
    const raw = this.configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
    const parsed = raw
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

    const unique = Array.from(new Set(parsed));
    if (unique.length !== 1) {
      throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
    }
    return unique[0] ?? 'HS256';
  }

  private getJwtSecretOrKey(): string {
    const algorithm = this.getAllowedJwtAlgorithm();

    if (algorithm === 'RS256') {
      const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY');
      if (!publicKey) {
        throw new Error('JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS includes RS256');
      }
      return publicKey;
    }

    return this.configService.getOrThrow<string>('auth.jwtSecret');
  }

  private extractTokenFromHandshake(client: Socket): string | undefined {
    if (client.handshake.query.token) {
      return client.handshake.query.token as string;
    }

    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      return authHeader.split(' ')[1];
    }

    return undefined;
  }
}
