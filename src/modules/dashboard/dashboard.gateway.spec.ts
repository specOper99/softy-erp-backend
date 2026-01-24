import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { DashboardGateway } from './dashboard.gateway';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import type { Server } from 'socket.io';

describe('DashboardGateway', () => {
  let gateway: DashboardGateway;
  let emitMock: jest.Mock;
  let roomJoined: string | string[] | undefined;
  let mockNamespaceEmit: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardGateway,
        // Mock WsJwtGuard since it is used in UseGuards
        {
          provide: WsJwtGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ALLOWED_ALGORITHMS') return 'HS256';
              return undefined;
            }),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'auth.jwtSecret') return 'test-jwt-secret';
              if (key === 'JWT_PUBLIC_KEY') return 'test-jwt-public-key';
              throw new Error(`Missing config key: ${key}`);
            }),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            isBlacklisted: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn().mockResolvedValue({ id: 'user-123', isActive: true }),
          },
        },
      ],
    }).compile();

    gateway = module.get<DashboardGateway>(DashboardGateway);

    // Mock the server with .to() method
    emitMock = jest.fn();
    roomJoined = undefined;
    mockNamespaceEmit = jest.fn();

    const to: Server['to'] = ((room: string | string[]) => {
      roomJoined = room;
      return { emit: mockNamespaceEmit } as unknown as ReturnType<Server['to']>;
    }) as Server['to'];

    gateway.server = {
      emit: emitMock as unknown as Server['emit'],
      to,
    } as unknown as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should reject handshake when Origin is not allowlisted', async () => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, DashboardGateway) as { allowRequest?: any } | undefined;
    const allowRequest = options?.allowRequest;
    expect(typeof allowRequest).toBe('function');

    const req = {
      headers: {
        origin: 'https://evil.example',
        host: 'evil.example',
      },
    } as any;

    const result = await new Promise<{ err: string | null | undefined; ok: boolean }>((resolve) => {
      allowRequest(req, (err: string | null | undefined, ok: boolean) => resolve({ err, ok }));
    });

    expect(result.ok).toBe(false);
    expect(result.err).toBeDefined();
  });

  it('handleConnection() joins tenant room when token is valid', async () => {
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer valid-token' }, query: {}, auth: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const jwtService = gateway['jwtService'];
    (jwtService.verifyAsync as jest.Mock).mockReturnValue({ tenantId: 'tenant-123', sub: 'user-123' });

    await gateway.handleConnection(mockClient);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'valid-token',
      expect.objectContaining({ algorithms: ['HS256'], secret: 'test-jwt-secret' }),
    );
    expect(mockClient.join).toHaveBeenCalledWith('tenant:tenant-123');
  });

  it('handleConnection() does nothing when token is invalid', async () => {
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer invalid-token' }, query: {}, auth: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    const jwtService = gateway['jwtService'];
    (jwtService.verifyAsync as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    await gateway.handleConnection(mockClient);

    expect(mockClient.join).not.toHaveBeenCalled();
  });

  it('should handle disconnection', () => {
    gateway.handleDisconnect({} as any);
    // Expect nothing to happen essentially as it is empty
  });

  it('broadcastMetricsUpdate() emits only to tenant room', () => {
    const tenantId = 'tenant-1';
    const type = 'BOOKING';
    const data = { a: 1 };

    gateway.broadcastMetricsUpdate(tenantId, type, data);

    expect(roomJoined).toBe(`tenant:${tenantId}`);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('should broadcast metrics update', () => {
    const tenantId = 'tenant-1';
    const type = 'BOOKING';
    const data = { count: 1 };

    gateway.broadcastMetricsUpdate(tenantId, type, data);

    // Check that .to() was called with the correct room
    expect(roomJoined).toBe(`tenant:${tenantId}`);

    expect(mockNamespaceEmit).toHaveBeenCalledWith('metrics:update', { type, data });
  });
});
