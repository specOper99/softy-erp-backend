import type { IncomingMessage } from 'node:http';
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOriginDelegate, getCorsOriginAllowlist } from '../../common/utils/cors-origins.util';
import { getAllowedJwtAlgorithm } from '../../common/utils/jwt-algorithm.util';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { toErrorMessage } from '../../common/utils/error.util';

const _nodeEnv = process.env.NODE_ENV ?? 'development';
const corsAllowlist = getCorsOriginAllowlist({
  raw: process.env.CORS_ORIGINS,
  requiresOrigins: _nodeEnv !== 'development' && _nodeEnv !== 'test',
  devFallback: ['http://localhost:3000', 'http://localhost:4200', 'http://localhost:5173'],
});

// Module-level logger used in the @WebSocketGateway decorator callback, which
// executes outside of class scope and cannot access `this.logger`.
const gatewayDecoratorLogger = new Logger('DashboardGateway');

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

function readHttpOrigin(header: unknown): string | undefined {
  if (typeof header === 'string') {
    return header;
  }

  if (Array.isArray(header) && typeof header[0] === 'string') {
    return header[0];
  }

  return undefined;
}

function readHandshakeToken(auth: unknown): string | undefined {
  if (!auth || typeof auth !== 'object' || !('token' in auth)) {
    return undefined;
  }

  const token = auth.token;
  return typeof token === 'string' ? token : undefined;
}

@WebSocketGateway({
  namespace: 'dashboard',
  cors: {
    origin: corsOriginDelegate(corsAllowlist),
  },
  allowRequest: (req: IncomingMessage, callback) => {
    const origin = readHttpOrigin(req.headers.origin);
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
    } catch (error) {
      gatewayDecoratorLogger.warn(`WebSocket CORS: failed to parse origin "${origin}": ${toErrorMessage(error)}`);
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
      this.logger.debug(`Connection rejected: ${toErrorMessage(error)}`);
    }
  }

  private getAllowedJwtAlgorithm(): 'HS256' | 'RS256' {
    return getAllowedJwtAlgorithm(this.configService);
  }

  private extractToken(client: AuthenticatedSocket): string | undefined {
    const authToken = readHandshakeToken(client.handshake.auth);
    if (typeof authToken === 'string') {
      return authToken;
    }
    if (client.handshake.headers.authorization) {
      const authHeader = client.handshake.headers.authorization;
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer' && typeof parts[1] === 'string') {
        return parts[1];
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
