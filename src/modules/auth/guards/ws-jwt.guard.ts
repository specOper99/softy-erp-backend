import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { getAllowedJwtAlgorithm } from '../../../common/utils/jwt-algorithm.util';
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
    return getAllowedJwtAlgorithm(this.configService);
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
    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && typeof token === 'string' && token.length > 0) {
        return token;
      }
    }

    const queryToken = client.handshake.query.token;
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const allowQueryToken =
      this.configService.get<string>('WS_ALLOW_QUERY_TOKEN') === 'true' || nodeEnv !== 'production';

    if (allowQueryToken && typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return undefined;
  }
}
