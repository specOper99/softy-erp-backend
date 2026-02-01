import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { corsOriginDelegate, getCorsOriginAllowlist } from '../../common/utils/cors-origins.util';

const corsAllowlist = getCorsOriginAllowlist({
  raw: process.env.CORS_ORIGINS,
  isProd: process.env.NODE_ENV === 'production',
  devFallback: ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5173'],
});

interface MetricsUpdateData {
  [key: string]: unknown;
}

interface AuthenticatedSocket extends Socket {
  data: {
    tenantId?: string;
    userId?: string;
  };
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

@WebSocketGateway({
  namespace: 'dashboard',
  cors: {
    origin: corsOriginDelegate(corsAllowlist),
  },
  allowRequest: (req, callback) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (origin === undefined) {
      return callback(null, true);
    }

    if (typeof origin !== 'string') {
      return callback('Origin not allowed', false);
    }

    try {
      const normalized = new URL(origin).origin;
      const ok = corsAllowlist.has(normalized);
      return callback(ok ? null : 'Origin not allowed', ok);
    } catch {
      return callback('Origin not allowed', false);
    }
  },
})
@UseGuards(WsJwtGuard)
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DashboardGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return;
      }

      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (isBlacklisted) return;

      const algorithm = this.getAllowedJwtAlgorithm();
      const payload =
        algorithm === 'RS256'
          ? await this.jwtService.verifyAsync<JwtPayload>(token, {
              algorithms: [algorithm],
              publicKey: this.configService.getOrThrow<string>('JWT_PUBLIC_KEY'),
            })
          : await this.jwtService.verifyAsync<JwtPayload>(token, {
              algorithms: [algorithm],
              secret: this.configService.getOrThrow<string>('auth.jwtSecret'),
            });

      const tenantId = payload.tenantId;
      if (tenantId) {
        client.data.tenantId = tenantId;
        client.data.userId = payload.sub;
        void client.join(`tenant:${tenantId}`);
      }
    } catch (error) {
      this.logger.debug(`Connection rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private extractToken(client: AuthenticatedSocket): string | undefined {
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token as string;
    }
    if (client.handshake.headers.authorization) {
      const authHeader = client.handshake.headers.authorization;
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1] as string;
      }
    }
    return undefined;
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const tenantId = client.data?.tenantId;
    if (tenantId) {
      void client.leave(`tenant:${tenantId}`);
    }
  }

  /**
   * Broadcast metrics update ONLY to clients in the specified tenant's room.
   * This prevents cross-tenant data leakage.
   */
  broadcastMetricsUpdate(tenantId: string, type: 'BOOKING' | 'REVENUE' | 'TASK', data: MetricsUpdateData) {
    if (!tenantId) {
      return; // Never broadcast without tenant context
    }
    this.server.to(`tenant:${tenantId}`).emit('metrics:update', { type, data });
  }
}
