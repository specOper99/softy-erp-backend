import { UseGuards } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

interface MetricsUpdateData {
  [key: string]: unknown;
}

@WebSocketGateway({
  namespace: 'dashboard',
  cors: {
    origin: '*',
  },
})
@UseGuards(WsJwtGuard)
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}

  handleDisconnect(_client: Socket) {}

  broadcastMetricsUpdate(_tenantId: string, type: 'BOOKING' | 'REVENUE' | 'TASK', data: MetricsUpdateData) {
    this.server.emit('metrics:update', { type, data });
  }
}
